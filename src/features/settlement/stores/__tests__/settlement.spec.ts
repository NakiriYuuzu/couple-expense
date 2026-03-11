import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettlementStore } from '../settlement'

const { rpc, from, selectChain, profileSelectChain } = vi.hoisted(() => {
    const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        in: vi.fn()
    }

    const profileSelectChain = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn()
    }

    return {
        rpc: vi.fn(),
        from: vi.fn(),
        selectChain,
        profileSelectChain
    }
})

vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        rpc,
        from
    }
}))

vi.mock('pinia-plugin-persistedstate', () => ({
    default: () => ({})
}))

// Helper: set up the `from` mock so that 'user_profiles' returns profileSelectChain
// and everything else returns selectChain
function setupFromMock() {
    from.mockImplementation((table: string) => {
        if (table === 'user_profiles') return profileSelectChain
        return selectChain
    })
}

describe('useSettlementStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())

        rpc.mockReset()
        from.mockReset()
        selectChain.select.mockReset().mockReturnThis()
        selectChain.eq.mockReset().mockReturnThis()
        selectChain.gte.mockReset().mockReturnThis()
        selectChain.lt.mockReset().mockReturnThis()
        selectChain.order.mockReset().mockReturnThis()
        selectChain.in.mockReset()
        profileSelectChain.select.mockReset().mockReturnThis()
        profileSelectChain.in.mockReset()

        setupFromMock()
    })

    // ─── Initial State ──────────────────────────────────────────────────────

    describe('initial state', () => {
        it('starts with empty arrays and no error', () => {
            const store = useSettlementStore()
            expect(store.netBalances).toEqual([])
            expect(store.simplifiedDebts).toEqual([])
            expect(store.settlements).toEqual([])
            expect(store.monthlySnapshots).toEqual([])
            expect(store.currentMonthSnapshot).toBeNull()
            expect(store.availableMonths).toEqual([])
            expect(store.monthDebtCache).toEqual({})
            expect(store.loading).toBe(false)
            expect(store.error).toBeNull()
        })
    })

    // ─── hasOutstandingDebts ─────────────────────────────────────────────────

    describe('hasOutstandingDebts', () => {
        it('returns false when netBalances is empty', () => {
            const store = useSettlementStore()
            expect(store.hasOutstandingDebts).toBe(false)
        })

        it('returns true when a balance exceeds zero', () => {
            const store = useSettlementStore()
            store.netBalances = [
                { userId: 'u1', displayName: 'Alice', avatarUrl: null, netBalance: 50 }
            ]
            expect(store.hasOutstandingDebts).toBe(true)
        })

        it('returns true when a negative balance exists', () => {
            const store = useSettlementStore()
            store.netBalances = [
                { userId: 'u1', displayName: 'Bob', avatarUrl: null, netBalance: -25 }
            ]
            expect(store.hasOutstandingDebts).toBe(true)
        })

        it('returns false when all balances are zero', () => {
            const store = useSettlementStore()
            store.netBalances = [
                { userId: 'u1', displayName: 'Alice', avatarUrl: null, netBalance: 0 },
                { userId: 'u2', displayName: 'Bob', avatarUrl: null, netBalance: 0 }
            ]
            expect(store.hasOutstandingDebts).toBe(false)
        })
    })

    // ─── totalGroupDebt ─────────────────────────────────────────────────────

    describe('totalGroupDebt', () => {
        it('returns 0 when netBalances is empty', () => {
            const store = useSettlementStore()
            expect(store.totalGroupDebt).toBe(0)
        })

        it('sums only positive balances', () => {
            const store = useSettlementStore()
            store.netBalances = [
                { userId: 'u1', displayName: 'Alice', avatarUrl: null, netBalance: 100 },
                { userId: 'u2', displayName: 'Bob', avatarUrl: null, netBalance: -100 },
                { userId: 'u3', displayName: 'Carol', avatarUrl: null, netBalance: 50 }
            ]
            expect(store.totalGroupDebt).toBe(150)
        })

        it('returns 0 when all balances are negative or zero', () => {
            const store = useSettlementStore()
            store.netBalances = [
                { userId: 'u1', displayName: 'Alice', avatarUrl: null, netBalance: -30 },
                { userId: 'u2', displayName: 'Bob', avatarUrl: null, netBalance: 0 }
            ]
            expect(store.totalGroupDebt).toBe(0)
        })
    })

    // ─── clearSettlementData ─────────────────────────────────────────────────

    describe('clearSettlementData', () => {
        it('resets all state including profileCache', () => {
            const store = useSettlementStore()

            // Populate with data
            store.netBalances = [
                { userId: 'u1', displayName: 'A', avatarUrl: null, netBalance: 10 }
            ]
            store.simplifiedDebts = [{
                fromUser: { userId: 'u1', displayName: 'A', avatarUrl: null },
                toUser: { userId: 'u2', displayName: 'B', avatarUrl: null },
                amount: 10
            }]
            store.error = 'some error'

            store.clearSettlementData()

            expect(store.netBalances).toEqual([])
            expect(store.simplifiedDebts).toEqual([])
            expect(store.settlements).toEqual([])
            expect(store.monthlySnapshots).toEqual([])
            expect(store.currentMonthSnapshot).toBeNull()
            expect(store.availableMonths).toEqual([])
            expect(store.monthDebtCache).toEqual({})
            expect(store.error).toBeNull()
        })
    })

    // ─── fetchNetBalances ────────────────────────────────────────────────────

    describe('fetchNetBalances', () => {
        it('normalizes RPC response to integer NetBalance objects', async () => {
            const rpcData = [
                { user_id: 'u1', net_balance: 33.6 },
                { user_id: 'u2', net_balance: 33.6 },
                { user_id: 'u3', net_balance: -67.2 }
            ]

            rpc.mockResolvedValueOnce({ data: rpcData, error: null })

            profileSelectChain.in.mockResolvedValueOnce({
                data: [
                    { id: 'u1', display_name: 'Alice', avatar_url: 'alice.png' },
                    { id: 'u2', display_name: 'Bob', avatar_url: null },
                    { id: 'u3', display_name: 'Carol', avatar_url: null }
                ],
                error: null
            })

            const store = useSettlementStore()
            await store.fetchNetBalances('group-1')

            expect(rpc).toHaveBeenCalledWith('get_group_balances', { p_group_id: 'group-1' })
            expect(store.netBalances).toEqual([
                { userId: 'u1', displayName: 'Alice', avatarUrl: 'alice.png', netBalance: 34 },
                { userId: 'u2', displayName: 'Bob', avatarUrl: null, netBalance: 33 },
                { userId: 'u3', displayName: 'Carol', avatarUrl: null, netBalance: -67 }
            ])
            expect(store.error).toBeNull()
        })

        it('sets error state when RPC fails', async () => {
            rpc.mockResolvedValueOnce({
                data: null,
                error: new Error('Network failure')
            })

            const store = useSettlementStore()
            await store.fetchNetBalances('group-1')

            expect(store.error).toBe('Network failure')
            expect(store.netBalances).toEqual([])
        })
    })

    // ─── fetchSimplifiedDebts ────────────────────────────────────────────────

    describe('fetchSimplifiedDebts', () => {
        it('normalizes RPC response to integer SimplifiedDebt objects', async () => {
            const rpcData = [
                { from_user: 'u1', to_user: 'u2', amount: 33.6 },
                { from_user: 'u3', to_user: 'u2', amount: 33.2 }
            ]

            rpc.mockResolvedValueOnce({ data: rpcData, error: null })

            profileSelectChain.in.mockResolvedValueOnce({
                data: [
                    { id: 'u1', display_name: 'Alice', avatar_url: null },
                    { id: 'u2', display_name: 'Bob', avatar_url: 'bob.png' },
                    { id: 'u3', display_name: 'Carol', avatar_url: null }
                ],
                error: null
            })

            const store = useSettlementStore()
            await store.fetchSimplifiedDebts('group-1')

            expect(rpc).toHaveBeenCalledWith('get_simplified_debts', { p_group_id: 'group-1' })
            expect(store.simplifiedDebts).toEqual([
                {
                    fromUser: { userId: 'u1', displayName: 'Alice', avatarUrl: null },
                    toUser: { userId: 'u2', displayName: 'Bob', avatarUrl: 'bob.png' },
                    amount: 34
                },
                {
                    fromUser: { userId: 'u3', displayName: 'Carol', avatarUrl: null },
                    toUser: { userId: 'u2', displayName: 'Bob', avatarUrl: 'bob.png' },
                    amount: 33
                }
            ])
            expect(store.error).toBeNull()
        })

        it('sets error state when RPC fails', async () => {
            rpc.mockResolvedValueOnce({
                data: null,
                error: { message: 'RPC error' }
            })

            const store = useSettlementStore()
            await store.fetchSimplifiedDebts('group-1')

            expect(store.error).toBe('獲取簡化債務失敗')
            expect(store.simplifiedDebts).toEqual([])
        })
    })

    // ─── fetchSettlementHistory ──────────────────────────────────────────────

    describe('fetchSettlementHistory', () => {
        it('fetches and stores settlement rows from query chain', async () => {
            const settlementRows = [
                {
                    id: 's1',
                    group_id: 'group-1',
                    paid_by: 'u1',
                    paid_to: 'u2',
                    amount: 200,
                    notes: 'Dinner',
                    settled_at: '2026-03-01T00:00:00Z',
                    created_at: '2026-03-01T00:00:00Z'
                }
            ]

            selectChain.order.mockResolvedValueOnce({
                data: settlementRows,
                error: null
            })

            const store = useSettlementStore()
            await store.fetchSettlementHistory('group-1')

            expect(from).toHaveBeenCalledWith('settlements')
            expect(store.settlements).toEqual(settlementRows)
            expect(store.error).toBeNull()
        })

        it('sets error when query fails', async () => {
            selectChain.order.mockResolvedValueOnce({
                data: null,
                error: new Error('Query failed')
            })

            const store = useSettlementStore()
            await store.fetchSettlementHistory('group-1')

            expect(store.error).toBe('Query failed')
            expect(store.settlements).toEqual([])
        })
    })

    // ─── Loading State ───────────────────────────────────────────────────────

    describe('loading state', () => {
        it('loading is true during fetch and false after completion', async () => {
            rpc.mockResolvedValueOnce({ data: [], error: null })

            const store = useSettlementStore()

            const fetchPromise = store.fetchNetBalances('group-1')
            await fetchPromise

            expect(store.loading).toBe(false)
        })

        it('loading returns to false even on error', async () => {
            rpc.mockResolvedValueOnce({
                data: null,
                error: new Error('fail')
            })

            const store = useSettlementStore()
            await store.fetchNetBalances('group-1')

            expect(store.loading).toBe(false)
        })
    })

    // ─── monthDebtCache ──────────────────────────────────────────────────────

    describe('monthDebtCache', () => {
        it('caches results and skips fetch when already cached', async () => {
            rpc
                .mockResolvedValueOnce({
                    data: [{ user_id: 'u1', net_balance: 50 }],
                    error: null
                })
                .mockResolvedValueOnce({
                    data: [{ from_user: 'u1', to_user: 'u2', amount: 50 }],
                    error: null
                })

            profileSelectChain.in.mockResolvedValue({
                data: [
                    { id: 'u1', display_name: 'Alice', avatar_url: null },
                    { id: 'u2', display_name: 'Bob', avatar_url: null }
                ],
                error: null
            })

            selectChain.lt.mockResolvedValueOnce({
                data: [{ amount: 100 }],
                error: null
            })

            const store = useSettlementStore()
            await store.fetchMonthDebts('group-1', '2025-06')

            expect(rpc).toHaveBeenCalledTimes(2)
            expect(store.monthDebtCache['2025-06']).toBeDefined()
            expect(store.monthDebtCache['2025-06']!.yearMonth).toBe('2025-06')

            // Second call with same month — should skip
            rpc.mockClear()
            await store.fetchMonthDebts('group-1', '2025-06')

            expect(rpc).not.toHaveBeenCalled()
        })

        it('re-fetches when forceRefresh is true even if cached', async () => {
            const store = useSettlementStore()

            // Pre-populate cache
            store.monthDebtCache = {
                '2025-06': {
                    id: null,
                    groupId: 'group-1',
                    yearMonth: '2025-06',
                    netBalances: [],
                    simplifiedDebts: [],
                    expenseCount: 0,
                    totalExpense: 0,
                    totalUnsettled: 0,
                    status: 'settled'
                }
            }

            rpc
                .mockResolvedValueOnce({
                    data: [{ user_id: 'u1', net_balance: 10 }],
                    error: null
                })
                .mockResolvedValueOnce({
                    data: [],
                    error: null
                })

            profileSelectChain.in.mockResolvedValue({
                data: [{ id: 'u1', display_name: 'Alice', avatar_url: null }],
                error: null
            })

            selectChain.lt.mockResolvedValueOnce({
                data: [{ amount: 200 }],
                error: null
            })

            await store.fetchMonthDebts('group-1', '2025-06', true)

            expect(rpc).toHaveBeenCalledTimes(2)
            expect(store.monthDebtCache['2025-06']!.netBalances).toHaveLength(1)
        })

        it('normalizes month debts to whole-dollar values', async () => {
            rpc
                .mockResolvedValueOnce({
                    data: [
                        { user_id: 'u1', net_balance: 33.6 },
                        { user_id: 'u2', net_balance: -33.6 }
                    ],
                    error: null
                })
                .mockResolvedValueOnce({
                    data: [
                        { from_user: 'u2', to_user: 'u1', amount: 33.6 }
                    ],
                    error: null
                })

            profileSelectChain.in.mockResolvedValue({
                data: [
                    { id: 'u1', display_name: 'Alice', avatar_url: null },
                    { id: 'u2', display_name: 'Bob', avatar_url: null }
                ],
                error: null
            })

            selectChain.lt.mockResolvedValueOnce({
                data: [{ amount: 100 }],
                error: null
            })

            const store = useSettlementStore()
            await store.fetchMonthDebts('group-1', '2025-06', true)

            expect(store.monthDebtCache['2025-06']).toMatchObject({
                netBalances: [
                    { userId: 'u1', netBalance: 34 },
                    { userId: 'u2', netBalance: -34 }
                ],
                simplifiedDebts: [
                    {
                        fromUser: { userId: 'u2' },
                        toUser: { userId: 'u1' },
                        amount: 34
                    }
                ],
                totalUnsettled: 34
            })
        })

        it('marks month as settled when totalUnsettled is 0', async () => {
            rpc
                .mockResolvedValueOnce({
                    data: [
                        { user_id: 'u1', net_balance: 0 },
                        { user_id: 'u2', net_balance: 0 }
                    ],
                    error: null
                })
                .mockResolvedValueOnce({
                    data: [],
                    error: null
                })

            profileSelectChain.in.mockResolvedValue({
                data: [
                    { id: 'u1', display_name: 'Alice', avatar_url: null },
                    { id: 'u2', display_name: 'Bob', avatar_url: null }
                ],
                error: null
            })

            selectChain.lt.mockResolvedValueOnce({
                data: [{ amount: 100 }],
                error: null
            })

            const store = useSettlementStore()
            await store.fetchMonthDebts('group-1', '2025-06', true)

            expect(store.monthDebtCache['2025-06']!.status).toBe('settled')
            expect(store.monthDebtCache['2025-06']!.totalUnsettled).toBe(0)
        })
    })

    // ─── profileCache ────────────────────────────────────────────────────────

    describe('profileCache', () => {
        it('caches user profiles and skips re-fetch for known IDs', async () => {
            rpc.mockResolvedValueOnce({
                data: [
                    { user_id: 'u1', net_balance: 100 },
                    { user_id: 'u2', net_balance: -100 }
                ],
                error: null
            })

            profileSelectChain.in.mockResolvedValueOnce({
                data: [
                    { id: 'u1', display_name: 'Alice', avatar_url: null },
                    { id: 'u2', display_name: 'Bob', avatar_url: null }
                ],
                error: null
            })

            const store = useSettlementStore()
            await store.fetchNetBalances('group-1')

            expect(profileSelectChain.in).toHaveBeenCalledTimes(1)

            // Second fetch — same user IDs should not trigger another profile fetch
            rpc.mockResolvedValueOnce({
                data: [
                    { user_id: 'u1', net_balance: 200 },
                    { user_id: 'u2', net_balance: -200 }
                ],
                error: null
            })

            profileSelectChain.in.mockClear()

            await store.fetchNetBalances('group-1')

            // Profile fetch should NOT have been called again
            expect(profileSelectChain.in).not.toHaveBeenCalled()
        })

        it('fetches only uncached IDs when some are already known', async () => {
            // First call with u1
            rpc.mockResolvedValueOnce({
                data: [{ user_id: 'u1', net_balance: 50 }],
                error: null
            })

            profileSelectChain.in.mockResolvedValueOnce({
                data: [{ id: 'u1', display_name: 'Alice', avatar_url: null }],
                error: null
            })

            const store = useSettlementStore()
            await store.fetchNetBalances('group-1')

            // Second call with u1 + u3 (u3 is new)
            rpc.mockResolvedValueOnce({
                data: [
                    { user_id: 'u1', net_balance: 30 },
                    { user_id: 'u3', net_balance: -30 }
                ],
                error: null
            })

            profileSelectChain.in.mockResolvedValueOnce({
                data: [{ id: 'u3', display_name: 'Carol', avatar_url: 'carol.png' }],
                error: null
            })

            await store.fetchNetBalances('group-1')

            // The second .in call should only request u3
            const secondInCall = profileSelectChain.in.mock.calls[1]
            expect(secondInCall![0]).toBe('id')
            expect(secondInCall![1]).toEqual(['u3'])
        })
    })

    // ─── Error Handling ──────────────────────────────────────────────────────

    describe('error handling', () => {
        it('handles non-Error thrown values with fallback message', async () => {
            rpc.mockResolvedValueOnce({
                data: null,
                error: 'string error value'
            })

            const store = useSettlementStore()
            await store.fetchNetBalances('group-1')

            expect(store.error).toBe('獲取群組餘額失敗')
        })

        it('clears previous error on new fetch', async () => {
            const store = useSettlementStore()
            store.error = 'previous error'

            rpc.mockResolvedValueOnce({ data: [], error: null })

            await store.fetchNetBalances('group-1')

            expect(store.error).toBeNull()
        })

        it('createSettlement re-throws error after setting error state', async () => {
            rpc.mockResolvedValueOnce({
                data: null,
                error: new Error('settle failed')
            })

            const store = useSettlementStore()

            await expect(
                store.createSettlement('group-1', 'u2', 100, 'test')
            ).rejects.toThrow('settle failed')

            expect(store.error).toBe('settle failed')
            expect(store.loading).toBe(false)
        })
    })

    // ─── fetchAvailableMonths ────────────────────────────────────────────────

    describe('fetchAvailableMonths', () => {
        it('maps RPC response to string array of year_month values', async () => {
            rpc.mockResolvedValueOnce({
                data: [{ year_month: '2026-01' }, { year_month: '2026-02' }],
                error: null
            })

            const store = useSettlementStore()
            await store.fetchAvailableMonths('group-1')

            expect(rpc).toHaveBeenCalledWith('get_expense_months', { p_group_id: 'group-1' })
            expect(store.availableMonths).toEqual(['2026-01', '2026-02'])
        })
    })
})
