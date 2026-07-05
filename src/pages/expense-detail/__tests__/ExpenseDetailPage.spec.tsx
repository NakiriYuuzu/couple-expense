import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import i18next, { i18nReady } from '@/shared/i18n'
import { queryKeys } from '@/shared/lib/queryKeys'
import { useSessionStore } from '@/shared/stores/session'
import { useAuthStore } from '@/features/auth/authStore'

// ── hoisted spies（刪除/undo/結清、router、toast）──────────────────────────
const h = vi.hoisted(() => {
    const SNAPSHOT = {
        expense: {
            id: 'exp-1', user_id: 'user-1', group_id: null, title: '午餐', amount: 100,
            category: 'food', icon: 'restaurant', date: '2026-06-01', currency: 'TWD',
            split_method: null, paid_by: 'user-1', notes: null, is_settled: false,
            created_at: '', updated_at: ''
        },
        splits: []
    }
    return {
        SNAPSHOT,
        remove: { mutateAsync: vi.fn(async () => SNAPSHOT), isPending: false },
        undo: { mutateAsync: vi.fn(async () => undefined) },
        deleteByDate: { mutateAsync: vi.fn(async () => []) },
        update: { mutateAsync: vi.fn(async () => undefined), isPending: false },
        settle: { mutateAsync: vi.fn(async () => 1), isPending: false },
        router: { history: { back: vi.fn() } },
        toast: { success: vi.fn(), error: vi.fn() },
        groupsPending: false,
        splitsPending: false,
        splitsError: false
    }
})

vi.mock('@/features/expense/api/useDeleteExpense', () => ({
    useDeleteExpense: () => ({ remove: h.remove, undo: h.undo, deleteByDate: h.deleteByDate })
}))
vi.mock('@/features/expense/api/useUpdateExpense', () => ({ useUpdateExpense: () => h.update }))
vi.mock('@/features/settlement/api/mutations', () => ({ useSettleExpense: () => h.settle }))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => h.router }))
vi.mock('sonner', () => ({ toast: h.toast }))

vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
        from: (table: string) => {
            const b: any = {
                select: () => b,
                eq: () => b,
                in: () => b,
                maybeSingle: async () => ({ data: null, error: null }),
                single: async () => ({ data: null, error: null }),
                then: (ok: any) => {
                    if (table === 'group_members' && h.groupsPending) return new Promise(() => {})
                    if (table === 'expense_splits' && h.splitsPending) return new Promise(() => {})
                    return Promise.resolve({
                        data: table === 'user_profiles'
                            ? [
                                  { id: 'user-2', display_name: '室友', avatar_url: null },
                                  { id: 'user-3', display_name: '前成員', avatar_url: null }
                              ]
                            : [],
                        error: table === 'expense_splits' && h.splitsError ? new Error('splits failed') : null
                    }).then(ok)
                }
            }
            return b
        }
    }
}))

import ExpenseDetailPage from '../ExpenseDetailPage'

const GID = '11111111-1111-4111-8111-111111111111'

const personalExpense = {
    id: 'exp-1', user_id: 'user-1', group_id: null, title: '午餐', amount: 100,
    category: 'food', icon: 'restaurant', date: '2026-06-01', currency: 'TWD',
    split_method: null, paid_by: 'user-1', notes: null, is_settled: false,
    created_at: '', updated_at: '', user: { id: 'user-1', display_name: '我', avatar_url: null }
} as any

const groupExpense = {
    id: 'exp-2', user_id: 'user-1', group_id: GID, title: '房租', amount: 300,
    category: 'home', icon: 'home', date: '2026-06-02', currency: 'TWD',
    split_method: 'equal', paid_by: 'user-1', notes: null, is_settled: false,
    created_at: '', updated_at: '', user: { id: 'user-1', display_name: '我', avatar_url: null }
} as any

const groupWithDetails = {
    group: { id: GID, name: 'Roomies', description: null, invitation_code: 'X', owner_id: 'user-1', is_active: true, created_at: '', updated_at: '' },
    members: [
        { id: 'm1', group_id: GID, user_id: 'user-1', role: 'owner', is_active: true, joined_at: '', created_at: '' },
        { id: 'm2', group_id: GID, user_id: 'user-2', role: 'member', is_active: true, joined_at: '', created_at: '' }
    ],
    settings: { group_id: GID, monthly_budget: 0, budget_start_day: 1, category_budgets: null, currency: 'TWD', default_split_method: 'equal', simplify_debts: false, created_at: '', updated_at: '' },
    memberCount: 1
} as any

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
    if (!window.matchMedia) {
        window.matchMedia = (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as any
    }
    if (!globalThis.ResizeObserver) {
        globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
    }
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
    if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
})

function renderDetail(
    id: string,
    options: { seedGroups?: boolean, seedSplits?: boolean, splits?: any[], groups?: any[] } = {}
): void {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
    if (options.seedGroups !== false) {
        client.setQueryData(queryKeys.groups(), options.groups ?? [groupWithDetails])
    }
    client.setQueryData(queryKeys.expenses(), [personalExpense, groupExpense])
    if (options.seedSplits !== false) {
        client.setQueryData(queryKeys.splits('exp-2'), options.splits ?? [
            { id: 's1', expense_id: 'exp-2', user_id: 'user-1', amount: 100, percentage: null, shares: null, is_settled: false, created_at: '' },
            { id: 's2', expense_id: 'exp-2', user_id: 'user-3', amount: 200, percentage: null, shares: null, is_settled: false, created_at: '' }
        ])
    }
    client.setQueryData(queryKeys.profiles('user-2'), { display_name: '室友', avatar_url: null })
    client.setQueryData(queryKeys.profiles('user-3'), { display_name: '前成員', avatar_url: null })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    render(<ExpenseDetailPage id={id} />, { wrapper })
}

describe('ExpenseDetailPage', () => {
    beforeEach(() => {
        useAuthStore.setState({ status: 'ready', user: { id: 'user-1' } as any, session: null })
        h.remove.mutateAsync.mockClear()
        h.undo.mutateAsync.mockClear()
        h.update.mutateAsync.mockClear()
        h.settle.mutateAsync.mockClear()
        h.router.history.back.mockClear()
        h.toast.success.mockClear()
        h.toast.error.mockClear()
        h.groupsPending = false
        h.splitsPending = false
        h.splitsError = false
    })

    it('renders the expense hero and (personal) omits the split section', () => {
        useSessionStore.setState({ activeGroupId: null })
        renderDetail('exp-1')
        expect(screen.getByText('午餐')).toBeTruthy()
        expect(screen.getByText('2026/06/01')).toBeTruthy()
        // 個人費用不顯示分帳明細
        expect(screen.queryByText('分帳明細')).toBeNull()
    })

    it('delete → confirm removes and offers an undo action that restores from snapshot', async () => {
        useSessionStore.setState({ activeGroupId: null })
        renderDetail('exp-1')

        // 開啟刪除確認（此時 body 的「刪除」為唯一）
        fireEvent.click(screen.getByRole('button', { name: '刪除' }))
        const dialog = await screen.findByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: '刪除' }))

        // remove 帶正確參數 + 導航返回 + undo action toast
        await waitFor(() =>
            expect(h.remove.mutateAsync).toHaveBeenCalledWith({ expenseId: 'exp-1', groupId: null })
        )
        await waitFor(() => expect(h.router.history.back).toHaveBeenCalled())
        await waitFor(() => expect(h.toast.success).toHaveBeenCalled())

        // 觸發 undo action → 以快照重建
        const call = h.toast.success.mock.calls[0] as unknown[]
        const opts = call[1] as { action: { onClick: () => void } }
        opts.action.onClick()
        await waitFor(() => expect(h.undo.mutateAsync).toHaveBeenCalledWith(h.SNAPSHOT))
    })

    it('group edit is disabled while split data is still pending', () => {
        useSessionStore.setState({ activeGroupId: GID })
        h.splitsPending = true
        renderDetail('exp-2', { seedSplits: false })

        const edit = screen.getByRole('button', { name: '編輯' }) as HTMLButtonElement
        expect(edit.disabled).toBe(true)
        fireEvent.click(edit)
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(h.update.mutateAsync).not.toHaveBeenCalled()
    })

    it('group edit stays disabled when empty splits loaded before group members metadata', () => {
        useSessionStore.setState({ activeGroupId: GID })
        h.groupsPending = true
        renderDetail('exp-2', { seedGroups: false, splits: [] })

        expect(screen.getByText('無分帳資料')).toBeTruthy()
        const edit = screen.getByRole('button', { name: '編輯' }) as HTMLButtonElement
        expect(edit.disabled).toBe(true)
        fireEvent.click(edit)
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('group edit stays disabled when empty splits loaded but target group is missing', () => {
        useSessionStore.setState({ activeGroupId: GID })
        renderDetail('exp-2', { splits: [], groups: [] })

        expect(screen.getByText('無分帳資料')).toBeTruthy()
        const edit = screen.getByRole('button', { name: '編輯' }) as HTMLButtonElement
        expect(edit.disabled).toBe(true)
        fireEvent.click(edit)
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('group edit stays disabled when empty splits loaded but target group has no members', () => {
        useSessionStore.setState({ activeGroupId: GID })
        renderDetail('exp-2', { splits: [], groups: [{ ...groupWithDetails, members: [] }] })

        expect(screen.getByText('無分帳資料')).toBeTruthy()
        const edit = screen.getByRole('button', { name: '編輯' }) as HTMLButtonElement
        expect(edit.disabled).toBe(true)
        fireEvent.click(edit)
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('group edit opens with member participants after empty splits and group members load', async () => {
        useSessionStore.setState({ activeGroupId: GID })
        renderDetail('exp-2', { splits: [] })

        fireEvent.click(screen.getByRole('button', { name: '編輯' }))
        const dialog = await screen.findByRole('dialog')
        expect(await within(dialog).findByLabelText('我')).toBeTruthy()
        expect(await within(dialog).findByLabelText('室友')).toBeTruthy()
    })

    it('renders an error state instead of no-data text when split loading fails', async () => {
        useSessionStore.setState({ activeGroupId: GID })
        h.splitsError = true
        renderDetail('exp-2', { seedSplits: false })

        expect(await screen.findByText('錯誤')).toBeTruthy()
        expect(screen.queryByText('無分帳資料')).toBeNull()
    })

    it('group edit preserves historical split participants that are no longer active members', async () => {
        useSessionStore.setState({ activeGroupId: GID })
        renderDetail('exp-2')

        fireEvent.click(screen.getByRole('button', { name: '編輯' }))
        const dialog = await screen.findByRole('dialog')
        const formerMember = await within(dialog).findByLabelText('前成員') as HTMLInputElement
        expect(formerMember.checked).toBe(true)

        fireEvent.change(within(dialog).getByLabelText('費用項目'), { target: { value: '房租更新' } })
        fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }))

        await waitFor(() => expect(h.update.mutateAsync).toHaveBeenCalled())
        const calls = h.update.mutateAsync.mock.calls as unknown[][]
        const payload = calls[0]![0] as { splits: unknown[] }
        expect(payload).toMatchObject({ id: 'exp-2', groupId: GID })
        expect(payload.splits).toEqual([
            { userId: 'user-1', amount: 150, percentage: undefined, shares: undefined },
            { userId: 'user-3', amount: 150, percentage: undefined, shares: undefined }
        ])
    })

    it('group expense: settle → confirm calls settleExpense with the scoped ids', async () => {
        useSessionStore.setState({ activeGroupId: GID })
        renderDetail('exp-2')

        fireEvent.click(await screen.findByRole('button', { name: /結清此筆/ }))
        const dialog = await screen.findByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: '確認還款' }))

        await waitFor(() =>
            expect(h.settle.mutateAsync).toHaveBeenCalledWith({ expenseId: 'exp-2', groupId: GID })
        )
    })
})
