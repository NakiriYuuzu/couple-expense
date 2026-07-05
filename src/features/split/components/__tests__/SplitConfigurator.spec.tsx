import { describe, it, expect, beforeAll } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import i18next, { i18nReady } from '@/shared/i18n'
import { formatCurrency } from '@/shared/lib/money'
import { SplitConfigurator } from '../SplitConfigurator'
import type { SplitMethod } from '@/shared/lib/database.types'
import type { SplitParticipant } from '@/entities/split/types'

// 受控包裝：持有 method / paidBy / participants，讓 onChange 能觸發重繪，
// 驗證 SplitConfigurator 與 calcSplits 的即時連動（守恆判定、每人金額顯示）。
function Harness({ totalAmount = 300 }: { totalAmount?: number }) {
    const [method, setMethod] = useState<SplitMethod>('equal')
    const [paidBy, setPaidBy] = useState('A')
    const [participants, setParticipants] = useState<SplitParticipant[]>([
        { userId: 'A', displayName: 'A', avatarUrl: null, amount: 0, percentage: 33.33, shares: 1, isIncluded: true },
        { userId: 'B', displayName: 'B', avatarUrl: null, amount: 0, percentage: 33.33, shares: 1, isIncluded: true },
        { userId: 'C', displayName: 'C', avatarUrl: null, amount: 0, percentage: 33.33, shares: 1, isIncluded: true }
    ])
    return (
        <SplitConfigurator
            totalAmount={totalAmount}
            splitMethod={method}
            onSplitMethodChange={setMethod}
            paidBy={paidBy}
            onPaidByChange={setPaidBy}
            participants={participants}
            onParticipantsChange={setParticipants}
            resolveName={id => id}
        />
    )
}

const balance = () => screen.getByTestId('split-balance')

describe('SplitConfigurator', () => {
    beforeAll(async () => {
        await i18nReady
        await i18next.changeLanguage('zh-TW')
    })

    it('renders the four split-method options', () => {
        render(<Harness />)
        for (const label of ['均分', '指定金額', '按比例', '按份數']) {
            expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy()
        }
    })

    it('equal split (300 / 3) is balanced and shows an equal formatted amount per person', () => {
        render(<Harness />)
        expect(balance().getAttribute('data-balanced')).toBe('true')
        expect(screen.getAllByText(formatCurrency(100, 'TWD'))).toHaveLength(3)
        expect(within(balance()).getByText('已平衡')).toBeTruthy()
    })

    it('exact split starts unbalanced (0 vs 300) and balances once amounts sum to the total', () => {
        render(<Harness />)
        fireEvent.click(screen.getByRole('button', { name: /指定金額/ }))
        // 全部 exact 金額初始為 0 → 0 ≠ 300 → 未平衡（即時反映）
        expect(balance().getAttribute('data-balanced')).toBe('false')

        // 指定 150 / 150 / 0 → 300 守恆 → 平衡
        fireEvent.change(screen.getByLabelText('A 金額'), { target: { value: '150' } })
        fireEvent.change(screen.getByLabelText('B 金額'), { target: { value: '150' } })
        expect(balance().getAttribute('data-balanced')).toBe('true')

        // 再改成不守恆 → 立即回到未平衡
        fireEvent.change(screen.getByLabelText('B 金額'), { target: { value: '100' } })
        expect(balance().getAttribute('data-balanced')).toBe('false')
    })

    it('exact input rejects non-integers (truncated to integer)', () => {
        render(<Harness />)
        fireEvent.click(screen.getByRole('button', { name: /指定金額/ }))
        const inputA = screen.getByLabelText('A 金額') as HTMLInputElement
        fireEvent.change(inputA, { target: { value: '150.75' } })
        // 非整數被截為整數（150），杜絕 zero-decimal 幣別的小數污染
        expect(inputA.value).toBe('150')
    })

    it('percentage split with even defaults is balanced', () => {
        render(<Harness />)
        fireEvent.click(screen.getByRole('button', { name: /按比例/ }))
        // 切換後 included 的百分比重設為均分（33.33），calcSplits 以最大餘數補足 → 100/100/100 守恆
        expect(balance().getAttribute('data-balanced')).toBe('true')
    })

    it('shares split with equal shares is balanced', () => {
        render(<Harness />)
        fireEvent.click(screen.getByRole('button', { name: /按份數/ }))
        expect(balance().getAttribute('data-balanced')).toBe('true')
    })

    it('shares split on a non-divisible total (100 / 3) still conserves via largest-remainder', () => {
        // total=100、shares 1/1/1 → calcSplits 以分計算 [33.34,33.33,33.33]，最大餘數法分配
        // 那 1 分餘額（calcSplits.ts:119-129 remainder 分支），總和守恆到 100（審查 A#2/B#3）。
        render(<Harness totalAmount={100} />)
        fireEvent.click(screen.getByRole('button', { name: /按份數/ }))
        expect(balance().getAttribute('data-balanced')).toBe('true')
    })

    it('excluding the current payer reassigns paidBy to a still-included member (審查 A#1/B#1 修復)', () => {
        render(<Harness />) // paidBy 預設 'A'
        // 取消勾選 A（目前付款人）→ 付款人 state 應自動改選第一位仍 included 者（B），不殘留 A
        fireEvent.click(screen.getByRole('checkbox', { name: 'A' }))
        const chips = screen.getByText('付款人').nextElementSibling as HTMLElement
        // A 的付款 chip 消失（不在 included）；B 成為付款人
        expect(within(chips).queryByRole('button', { name: /A/ })).toBeNull()
        const chipB = within(chips).getByRole('button', { name: /B/ })
        expect(chipB.getAttribute('aria-pressed')).toBe('true')
    })

    it('excluding a participant recomputes the equal split (300 / 2 per person)', () => {
        render(<Harness />)
        // 取消勾選 C → 只剩 A、B 均分
        const checkboxC = screen.getByRole('checkbox', { name: 'C' })
        fireEvent.click(checkboxC)
        expect(screen.getAllByText(formatCurrency(150, 'TWD'))).toHaveLength(2)
        expect(balance().getAttribute('data-balanced')).toBe('true')
        expect(screen.getByText('2 人')).toBeTruthy()
    })

    it('changing paidBy invokes the controlled setter (chip reflects selection)', () => {
        render(<Harness />)
        // paidBy 區塊：定位「付款人」標籤的相鄰 chips 容器，避免與分帳方式按鈕/勾選框重名。
        const chips = screen.getByText('付款人').nextElementSibling as HTMLElement
        const chipB = within(chips).getByRole('button', { name: /B/ })
        expect(chipB.getAttribute('aria-pressed')).toBe('false')
        fireEvent.click(chipB)
        expect(chipB.getAttribute('aria-pressed')).toBe('true')
    })
})
