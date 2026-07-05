import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18next, { i18nReady } from '@/shared/i18n'
import { queryKeys } from '@/shared/lib/queryKeys'
import { useAuthStore } from '@/features/auth/authStore'
import { useSessionStore } from '@/shared/stores/session'

const h = vi.hoisted(() => ({
    navigate: vi.fn()
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => h.navigate
}))

import GroupListPage from '../GroupListPage'

const FIRST_GROUP_ID = '11111111-1111-4111-8111-111111111111'
const SECOND_GROUP_ID = '22222222-2222-4222-8222-222222222222'

const groups = [
    {
        group: {
            id: FIRST_GROUP_ID,
            name: 'Roomies',
            description: null,
            invitation_code: 'ROOM42',
            max_members: 20,
            created_by: 'user-1',
            is_active: true,
            created_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-01T00:00:00Z'
        },
        members: [
            { id: 'm1', group_id: FIRST_GROUP_ID, user_id: 'user-1', role: 'owner', is_active: true, joined_at: '', created_at: '' },
            { id: 'm2', group_id: FIRST_GROUP_ID, user_id: 'user-2', role: 'member', is_active: true, joined_at: '', created_at: '' }
        ],
        settings: null,
        memberCount: 2
    },
    {
        group: {
            id: SECOND_GROUP_ID,
            name: 'Trip Fund',
            description: null,
            invitation_code: 'TRIP99',
            max_members: 20,
            created_by: 'user-2',
            is_active: true,
            created_at: '2026-06-02T00:00:00Z',
            updated_at: '2026-06-02T00:00:00Z'
        },
        members: [
            { id: 'm3', group_id: SECOND_GROUP_ID, user_id: 'user-1', role: 'member', is_active: true, joined_at: '', created_at: '' }
        ],
        settings: null,
        memberCount: 1
    }
] as any

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
})

function renderPage(): void {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
    client.setQueryData(queryKeys.groups(), groups)
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    render(<GroupListPage />, { wrapper })
}

describe('GroupListPage', () => {
    beforeEach(() => {
        h.navigate.mockClear()
        useAuthStore.setState({ status: 'ready', user: { id: 'user-1' } as any, session: null })
        useSessionStore.setState({ activeGroupId: FIRST_GROUP_ID })
    })

    it('clicking a group navigates to the clicked group id', () => {
        renderPage()

        fireEvent.click(screen.getByText('Trip Fund'))

        expect(h.navigate).toHaveBeenCalledWith({
            to: '/groups/$id',
            params: { id: SECOND_GROUP_ID }
        })
    })
})
