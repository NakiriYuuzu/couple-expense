import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { queryKeys } from '@/shared/lib/queryKeys'
import { useSessionStore } from '@/shared/stores/session'

// supabase benign stub：seed 過 ['groups'] cache（staleTime Infinity）後 fetchGroups 不應被打到。
vi.mock('@/shared/lib/supabase', () => ({
    supabase: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
        from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }) })
    }
}))

import { useActiveGroupGuard } from '../useActiveGroupGuard'

const GA = '11111111-1111-4111-8111-111111111111'
const GB = '22222222-2222-4222-8222-222222222222'

const groupsData = [
    { group: { id: GA, name: 'A' }, members: [], settings: null, memberCount: 0 }
] as any

function seededClient(): QueryClient {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } }
    })
    client.setQueryData(queryKeys.groups(), groupsData)
    return client
}

function wrapper() {
    const client = seededClient()
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

describe('useActiveGroupGuard', () => {
    beforeEach(() => {
        useSessionStore.setState({ activeGroupId: null })
    })

    it('evicts a stale activeGroupId not in the loaded groups → falls back to personal', async () => {
        useSessionStore.setState({ activeGroupId: GB })
        renderHook(() => useActiveGroupGuard(), { wrapper: wrapper() })
        await waitFor(() => expect(useSessionStore.getState().activeGroupId).toBeNull())
    })

    it('keeps an activeGroupId that is still a member', async () => {
        useSessionStore.setState({ activeGroupId: GA })
        renderHook(() => useActiveGroupGuard(), { wrapper: wrapper() })
        await new Promise((r) => setTimeout(r, 30))
        expect(useSessionStore.getState().activeGroupId).toBe(GA)
    })

    it('is a no-op in personal mode (activeGroupId null)', async () => {
        useSessionStore.setState({ activeGroupId: null })
        renderHook(() => useActiveGroupGuard(), { wrapper: wrapper() })
        await new Promise((r) => setTimeout(r, 30))
        expect(useSessionStore.getState().activeGroupId).toBeNull()
    })
})
