import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGroupStore } from '../group'
import type { GroupRow } from '@/shared/lib/database.types'

// Mock the supabase module so no real network calls occur
vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })
        },
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null })
        }),
        rpc: vi.fn().mockResolvedValue({ data: null, error: null })
    }
}))

// pinia-plugin-persistedstate needs to be stubbed as it accesses localStorage
vi.mock('pinia-plugin-persistedstate', () => ({
    default: () => ({})
}))

function makeGroup(id: string): GroupRow {
    return {
        id,
        name: `Group ${id}`,
        description: null,
        invitation_code: null,
        max_members: 10,
        created_by: 'user-1',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
}

describe('useGroupStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    describe('initial state', () => {
        it('starts with no active group (personal context)', () => {
            const store = useGroupStore()
            expect(store.activeGroupId).toBeNull()
            expect(store.isPersonalContext).toBe(true)
        })

        it('starts with empty groups list', () => {
            const store = useGroupStore()
            expect(store.groups).toHaveLength(0)
            expect(store.isInAnyGroup).toBe(false)
        })

        it('starts with no loading or error state', () => {
            const store = useGroupStore()
            expect(store.loading).toBe(false)
            expect(store.error).toBeNull()
        })
    })

    describe('setActiveGroup', () => {
        it('updates activeGroupId when called with a valid id', () => {
            const store = useGroupStore()
            store.setActiveGroup('group-abc')
            expect(store.activeGroupId).toBe('group-abc')
        })

        it('sets activeGroupId back to null (personal context)', () => {
            const store = useGroupStore()
            store.setActiveGroup('group-abc')
            store.setActiveGroup(null)
            expect(store.activeGroupId).toBeNull()
        })

        it('isPersonalContext becomes false when a group is selected', () => {
            const store = useGroupStore()
            store.setActiveGroup('group-abc')
            expect(store.isPersonalContext).toBe(false)
        })

        it('isPersonalContext becomes true after clearing the active group', () => {
            const store = useGroupStore()
            store.setActiveGroup('group-abc')
            store.setActiveGroup(null)
            expect(store.isPersonalContext).toBe(true)
        })
    })

    describe('isInAnyGroup', () => {
        it('is false when groups array is empty', () => {
            const store = useGroupStore()
            expect(store.isInAnyGroup).toBe(false)
        })

        it('is true when groups array has entries', () => {
            const store = useGroupStore()
            store.groups = [makeGroup('g1')]
            expect(store.isInAnyGroup).toBe(true)
        })
    })

    describe('activeGroup computed', () => {
        it('returns null when no active group is set', () => {
            const store = useGroupStore()
            store.groups = [makeGroup('g1')]
            expect(store.activeGroup).toBeNull()
        })

        it('returns the correct group when activeGroupId matches', () => {
            const store = useGroupStore()
            const group = makeGroup('g1')
            store.groups = [group]
            store.setActiveGroup('g1')
            expect(store.activeGroup).toEqual(group)
        })

        it('returns null when activeGroupId does not match any group', () => {
            const store = useGroupStore()
            store.groups = [makeGroup('g1')]
            store.setActiveGroup('non-existent')
            expect(store.activeGroup).toBeNull()
        })
    })

    describe('activeGroupMembers computed', () => {
        it('returns empty array when no group is active', () => {
            const store = useGroupStore()
            expect(store.activeGroupMembers).toHaveLength(0)
        })

        it('returns members for the active group', () => {
            const store = useGroupStore()
            const members = [
                { id: 'm1', group_id: 'g1', user_id: 'user-1', role: 'owner' as const, is_active: true, joined_at: '', created_at: '' }
            ]
            store.membersByGroup = { g1: members }
            store.setActiveGroup('g1')
            expect(store.activeGroupMembers).toEqual(members)
        })
    })

    describe('clearError', () => {
        it('clears the error state', () => {
            const store = useGroupStore()
            store.error = 'something went wrong'
            store.clearError()
            expect(store.error).toBeNull()
        })
    })

    describe('getCategoryBudget', () => {
        it('returns 0 when no group is active', () => {
            const store = useGroupStore()
            expect(store.getCategoryBudget('food')).toBe(0)
        })

        it('returns 0 when group has no settings', () => {
            const store = useGroupStore()
            store.setActiveGroup('g1')
            expect(store.getCategoryBudget('food')).toBe(0)
        })

        it('returns the configured budget for a category', () => {
            const store = useGroupStore()
            store.setActiveGroup('g1')
            store.settingsByGroup = {
                g1: {
                    id: 's1',
                    group_id: 'g1',
                    monthly_budget: 30000,
                    budget_start_day: 1,
                    category_budgets: { food: 5000 },
                    currency: 'TWD',
                    created_at: '',
                    updated_at: ''
                }
            }
            expect(store.getCategoryBudget('food')).toBe(5000)
        })

        it('returns 0 for a category not in the budget map', () => {
            const store = useGroupStore()
            store.setActiveGroup('g1')
            store.settingsByGroup = {
                g1: {
                    id: 's1',
                    group_id: 'g1',
                    monthly_budget: 30000,
                    budget_start_day: 1,
                    category_budgets: {},
                    currency: 'TWD',
                    created_at: '',
                    updated_at: ''
                }
            }
            expect(store.getCategoryBudget('food')).toBe(0)
        })
    })
})
