import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSplitStore } from '../split'

const { upsertSelect, upsert, selectEq, deleteIn, from } = vi.hoisted(() => ({
    upsertSelect: vi.fn(),
    upsert: vi.fn(),
    selectEq: vi.fn(),
    deleteIn: vi.fn(),
    from: vi.fn()
}))

vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        from
    }
}))

vi.mock('pinia-plugin-persistedstate', () => ({
    default: () => ({})
}))

describe('useSplitStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())

        upsertSelect.mockReset()
        upsert.mockReset()
        selectEq.mockReset()
        deleteIn.mockReset()
        from.mockReset()

        upsertSelect.mockResolvedValue({
            data: [
                {
                    id: 'split-1',
                    expense_id: 'expense-1',
                    user_id: 'user-1',
                    amount: 120,
                    percentage: 60,
                    shares: null,
                    is_settled: false,
                    created_at: '2026-03-10T00:00:00Z'
                }
            ],
            error: null
        })

        upsert.mockReturnValue({
            select: upsertSelect
        })

        // 查詢現有 splits（用於安全刪除）
        selectEq.mockResolvedValue({
            data: [
                { id: 'split-1', user_id: 'user-1' },
                { id: 'split-old', user_id: 'user-old' }
            ],
            error: null
        })

        // 刪除用 .in()
        deleteIn.mockResolvedValue({ error: null })

        from.mockImplementation(() => ({
            upsert,
            select: () => ({
                eq: selectEq
            }),
            delete: () => ({
                eq: selectEq,
                in: deleteIn
            })
        }))
    })

    it('upserts expense splits and deletes removed participants safely', async () => {
        const store = useSplitStore()

        const result = await store.updateExpenseSplits('expense-1', [
            {
                userId: 'user-1',
                amount: 120,
                percentage: 60
            }
        ])

        // 驗證 upsert 使用參數化查詢
        expect(upsert).toHaveBeenCalledWith([
            {
                expense_id: 'expense-1',
                user_id: 'user-1',
                amount: 120,
                percentage: 60,
                shares: null,
                is_settled: false
            }
        ], { onConflict: 'expense_id,user_id' })

        // 驗證使用 .in() 而非字串拼接 .not()
        expect(deleteIn).toHaveBeenCalledWith('id', ['split-old'])

        expect(store.getSplitsForExpense('expense-1')).toEqual(result)
    })

    it('deletes all splits when no incoming splits provided', async () => {
        const deleteEqAll = vi.fn().mockResolvedValue({ error: null })
        from.mockImplementation(() => ({
            upsert: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [], error: null })
            }),
            delete: () => ({
                eq: deleteEqAll
            })
        }))

        const store = useSplitStore()

        await store.updateExpenseSplits('expense-1', [])

        expect(deleteEqAll).toHaveBeenCalledWith('expense_id', 'expense-1')
    })

    it('skips delete when no participants were removed', async () => {
        // 現有 splits 只有 user-1，incoming 也只有 user-1 → 無需刪除
        selectEq.mockResolvedValue({
            data: [{ id: 'split-1', user_id: 'user-1' }],
            error: null
        })

        const store = useSplitStore()

        await store.updateExpenseSplits('expense-1', [
            { userId: 'user-1', amount: 100 }
        ])

        expect(deleteIn).not.toHaveBeenCalled()
    })
})
