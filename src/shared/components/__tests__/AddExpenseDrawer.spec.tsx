import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import i18next, { i18nReady } from '@/shared/i18n'
import { queryKeys } from '@/shared/lib/queryKeys'
import { useSessionStore } from '@/shared/stores/session'
import { useAuthStore } from '@/features/auth/authStore'

// ── mocks ──────────────────────────────────────────────────────
// useAddExpense：以 spy 捕捉送出的 CreateExpenseInput（Phase 4 資料層唯讀，此處只驗證契約）。
const h = vi.hoisted(() => ({
    mutateAsync: vi.fn(async () => ({ id: 'new-id', groupId: null }))
}))

// 取第 n 次呼叫的第一個引數（CreateExpenseInput）；as unknown[] 繞開 vi.fn 空 tuple 的型別窄化。
const firstArg = (call: number): any => (h.mutateAsync.mock.calls[call] as unknown[])[0]
vi.mock('@/features/expense/api/useAddExpense', () => ({
    useAddExpense: () => ({ mutateAsync: h.mutateAsync, isPending: false })
}))
// supabase：benign stub（seed 過 cache 後不應真的被打到；保底避免任何 network）。
vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
        from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) })
    }
}))

// ── vaul / radix 在 happy-dom 的環境補丁 ────────────────────────
beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')

    if (!window.matchMedia) {
        window.matchMedia = (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false
        })
    }
    if (!globalThis.ResizeObserver) {
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    }
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
    if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
})

// import AFTER mocks
import { AddExpenseDrawer } from '../AddExpenseDrawer'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'

const groupsData = [
    {
        group: {
            id: GROUP_ID,
            name: 'Roomies',
            description: null,
            invitation_code: 'ABC123',
            owner_id: 'user-1',
            is_active: true,
            created_at: '',
            updated_at: ''
        },
        members: [
            { id: 'm1', group_id: GROUP_ID, user_id: 'user-1', role: 'owner', is_active: true, joined_at: '', created_at: '' },
            { id: 'm2', group_id: GROUP_ID, user_id: 'user-2', role: 'member', is_active: true, joined_at: '', created_at: '' }
        ],
        settings: {
            group_id: GROUP_ID,
            monthly_budget: 0,
            budget_start_day: 1,
            category_budgets: null,
            currency: 'TWD',
            default_split_method: 'equal',
            simplify_debts: false,
            created_at: '',
            updated_at: ''
        },
        memberCount: 2
    }
] as any

function seededClient(): QueryClient {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } }
    })
    client.setQueryData(queryKeys.groups(), groupsData)
    client.setQueryData(queryKeys.expenses(), [])
    // seed profiles so loadProfiles resolves from cache（不打 supabase）
    client.setQueryData(queryKeys.profiles('user-1'), { display_name: '我', avatar_url: null })
    client.setQueryData(queryKeys.profiles('user-2'), { display_name: '室友', avatar_url: null })
    return client
}

function renderDrawer(onOpenChange = vi.fn()) {
    const client = seededClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    render(<AddExpenseDrawer open onOpenChange={onOpenChange} />, { wrapper })
    return { onOpenChange }
}

describe('AddExpenseDrawer', () => {
    beforeEach(() => {
        h.mutateAsync.mockClear()
        h.mutateAsync.mockResolvedValue({ id: 'new-id', groupId: null })
        useAuthStore.setState({ status: 'ready', user: { id: 'user-1' } as any, session: null })
    })

    it('personal mode: single step, submits a personal CreateExpenseInput and closes', async () => {
        useSessionStore.setState({ activeGroupId: null })
        const { onOpenChange } = renderDrawer()

        // 個人模式為單步：主按鈕直接是「新增費用」
        fireEvent.change(screen.getByLabelText('費用項目'), { target: { value: '午餐' } })
        fireEvent.change(screen.getByLabelText('金額'), { target: { value: '120' } })

        fireEvent.click(screen.getByRole('button', { name: '新增費用' }))

        await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
        const input = firstArg(0)
        expect(input.group_id).toBeNull()
        expect(input.title).toBe('午餐')
        expect(input.amount).toBe(120)
        expect(input.category).toBe('food')
        expect(input.icon).toBe('restaurant')
        expect(input.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(input.splits).toBeUndefined()
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it('non-integer amount blocks submit (validation guard)', async () => {
        useSessionStore.setState({ activeGroupId: null })
        renderDrawer()

        fireEvent.change(screen.getByLabelText('費用項目'), { target: { value: '咖啡' } })
        fireEvent.change(screen.getByLabelText('金額'), { target: { value: '99.5' } })

        // 非整數 → 顯示錯誤且主按鈕停用 → 送出不觸發
        expect(screen.getByText('請輸入有效的數字')).toBeTruthy()
        const submit = screen.getByRole('button', { name: '新增費用' }) as HTMLButtonElement
        expect(submit.disabled).toBe(true)
        fireEvent.click(submit)
        expect(h.mutateAsync).not.toHaveBeenCalled()
    })

    it('group mode: two-step flow, imbalance blocks submit, balanced submits correct split payload', async () => {
        useSessionStore.setState({ activeGroupId: GROUP_ID })
        const { onOpenChange } = renderDrawer()

        // lastUsed/active 群組（成員資格已驗證）→ 預選群組模式：兩步驟指示 + 「下一步」
        fireEvent.change(screen.getByLabelText('費用項目'), { target: { value: '晚餐' } })
        fireEvent.change(screen.getByLabelText('金額'), { target: { value: '300' } })

        fireEvent.click(screen.getByRole('button', { name: /下一步/ }))

        // Step 2：SplitConfigurator 出現，equal 均分 300/2 → 平衡
        expect(await screen.findByText('分帳方式')).toBeTruthy()
        expect(screen.getByTestId('split-balance').getAttribute('data-balanced')).toBe('true')

        // 切到「指定金額」→ 兩人皆 0 → 不守恆 → 主按鈕停用、點擊不送出
        fireEvent.click(screen.getByRole('button', { name: /指定金額/ }))
        expect(screen.getByTestId('split-balance').getAttribute('data-balanced')).toBe('false')
        const submitBtn = screen.getByRole('button', { name: '新增費用' }) as HTMLButtonElement
        expect(submitBtn.disabled).toBe(true)
        fireEvent.click(submitBtn)
        expect(h.mutateAsync).not.toHaveBeenCalled()

        // 切回均分 → 守恆 → 送出，payload 帶正確 splits
        fireEvent.click(screen.getByRole('button', { name: /均分/ }))
        expect(screen.getByTestId('split-balance').getAttribute('data-balanced')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: '新增費用' }))

        await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
        const input = firstArg(0)
        expect(input.group_id).toBe(GROUP_ID)
        expect(input.amount).toBe(300)
        expect(input.currency).toBe('TWD')
        expect(input.split_method).toBe('equal')
        expect(input.paid_by).toBe('user-1')
        expect(input.splits).toEqual([
            { userId: 'user-1', amount: 150, percentage: undefined, shares: undefined },
            { userId: 'user-2', amount: 150, percentage: undefined, shares: undefined }
        ])
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it('group mode percentage: submits split_method + persists per-split percentage（審查 A#3/B#3）', async () => {
        useSessionStore.setState({ activeGroupId: GROUP_ID })
        renderDrawer()

        fireEvent.change(screen.getByLabelText('費用項目'), { target: { value: '房租' } })
        fireEvent.change(screen.getByLabelText('金額'), { target: { value: '300' } })
        fireEvent.click(screen.getByRole('button', { name: /下一步/ }))

        // 切到「按比例」→ 均分預設 50/50 → 150/150 守恆
        fireEvent.click(await screen.findByRole('button', { name: /按比例/ }))
        expect(screen.getByTestId('split-balance').getAttribute('data-balanced')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: '新增費用' }))

        await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1))
        const input = firstArg(0)
        expect(input.split_method).toBe('percentage')
        // percentage 欄位須持久化（唯一守衛：ADD RPC 無伺服器端守恆斷言），shares 為 undefined
        expect(input.splits).toEqual([
            { userId: 'user-1', amount: 150, percentage: 50, shares: undefined },
            { userId: 'user-2', amount: 150, percentage: 50, shares: undefined }
        ])
    })
})
