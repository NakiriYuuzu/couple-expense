import { describe, expect, it, vi } from 'vitest'
import type { SimplifiedDebt } from '@/entities/settlement/types'

vi.mock('@/shared/lib/supabase', () => ({
    supabase: {}
}))

vi.mock('@/features/group/api/profiles', () => ({
    loadProfiles: vi.fn()
}))

import { filterDebtsForUser } from '../queries'

const debt = (fromUserId: string, toUserId: string, amount: number): SimplifiedDebt => ({
    fromUser: {
        userId: fromUserId,
        displayName: fromUserId,
        avatarUrl: null
    },
    toUser: {
        userId: toUserId,
        displayName: toUserId,
        avatarUrl: null
    },
    amount
})

describe('filterDebtsForUser', () => {
    it('keeps both directions involving the current user and removes third-party debts', () => {
        const result = filterDebtsForUser(
            [
                debt('user-1', 'user-2', 120),
                debt('user-3', 'user-1', 80),
                debt('user-2', 'user-3', 45)
            ],
            'user-1'
        )

        expect(result).toEqual([
            debt('user-1', 'user-2', 120),
            debt('user-3', 'user-1', 80)
        ])
    })

    it('returns no debt rows when the authenticated user is unavailable', () => {
        expect(filterDebtsForUser([debt('user-1', 'user-2', 120)], null)).toEqual([])
        expect(filterDebtsForUser([debt('user-1', 'user-2', 120)], undefined)).toEqual([])
    })
})