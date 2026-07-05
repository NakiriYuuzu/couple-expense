import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18next, { i18nReady } from '@/shared/i18n'
import { queryKeys } from '@/shared/lib/queryKeys'
import { useAuthStore } from '@/features/auth/authStore'
import { useSessionStore } from '@/shared/stores/session'

const h = vi.hoisted(() => ({
    navigate: vi.fn(),
    updateSettings: { mutateAsync: vi.fn(async () => ({})), isPending: false },
    leaveGroup: { mutateAsync: vi.fn(async () => undefined), isPending: false },
    toast: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => h.navigate
}))

vi.mock('@/features/group/api/useGroupMutations', () => ({
    useUpdateGroupSettings: () => h.updateSettings,
    useLeaveGroup: () => h.leaveGroup
}))

vi.mock('sonner', () => ({
    toast: h.toast
}))

import GroupSettingsPage from '../GroupSettingsPage'

const ROUTE_GROUP_ID = '11111111-1111-4111-8111-111111111111'
const ACTIVE_GROUP_ID = '22222222-2222-4222-8222-222222222222'

const groups = [
    {
        group: {
            id: ROUTE_GROUP_ID,
            name: 'Route Group',
            description: 'Route target',
            invitation_code: 'ROUTE1',
            max_members: 20,
            created_by: 'user-1',
            is_active: true,
            created_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-01T00:00:00Z'
        },
        members: [
            { id: 'm1', group_id: ROUTE_GROUP_ID, user_id: 'user-1', role: 'owner', is_active: true, joined_at: '', created_at: '' },
            { id: 'm2', group_id: ROUTE_GROUP_ID, user_id: 'user-2', role: 'member', is_active: true, joined_at: '', created_at: '' }
        ],
        settings: {
            id: 'settings-1',
            group_id: ROUTE_GROUP_ID,
            monthly_budget: 10000,
            budget_start_day: 1,
            category_budgets: { food: 1000, transport: 500, shopping: 0, home: 0, pet: 0, other: 0 },
            currency: 'TWD',
            default_split_method: 'equal',
            simplify_debts: false,
            created_at: '',
            updated_at: ''
        },
        memberCount: 2
    },
    {
        group: {
            id: ACTIVE_GROUP_ID,
            name: 'Active Group',
            description: null,
            invitation_code: 'ACTIVE',
            max_members: 20,
            created_by: 'user-2',
            is_active: true,
            created_at: '2026-06-02T00:00:00Z',
            updated_at: '2026-06-02T00:00:00Z'
        },
        members: [
            { id: 'm3', group_id: ACTIVE_GROUP_ID, user_id: 'user-1', role: 'admin', is_active: true, joined_at: '', created_at: '' }
        ],
        settings: {
            id: 'settings-2',
            group_id: ACTIVE_GROUP_ID,
            monthly_budget: 20000,
            budget_start_day: 15,
            category_budgets: { food: 2000, transport: 1000, shopping: 0, home: 0, pet: 0, other: 0 },
            currency: 'USD',
            default_split_method: 'shares',
            simplify_debts: false,
            created_at: '',
            updated_at: ''
        },
        memberCount: 1
    }
] as any

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
    if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
    if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
})

function renderPage(id: string): void {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
    client.setQueryData(queryKeys.groups(), groups)
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    render(<GroupSettingsPage id={id} />, { wrapper })
}

describe('GroupSettingsPage', () => {
    beforeEach(() => {
        h.navigate.mockClear()
        h.updateSettings.mutateAsync.mockClear()
        h.leaveGroup.mutateAsync.mockClear()
        h.toast.success.mockClear()
        h.toast.error.mockClear()
        useAuthStore.setState({ status: 'ready', user: { id: 'user-1' } as any, session: null })
        useSessionStore.setState({ activeGroupId: ACTIVE_GROUP_ID })
    })

    it('saves settings with the route id even when activeGroupId is different', async () => {
        renderPage(ROUTE_GROUP_ID)

        fireEvent.click(screen.getByRole('button', { name: '儲存' }))

        await waitFor(() => expect(h.updateSettings.mutateAsync).toHaveBeenCalled())
        const calls = h.updateSettings.mutateAsync.mock.calls as unknown[][]
        const payload = calls[0]?.[0]
        expect(payload).toMatchObject({
            groupId: ROUTE_GROUP_ID,
            patch: {
                monthly_budget: 10000,
                budget_start_day: 1,
                currency: 'TWD',
                default_split_method: 'equal'
            }
        })
    })
})
