import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18next, { i18nReady } from '@/shared/i18n'

const h = vi.hoisted(() => ({
    navigate: vi.fn(),
    createGroup: { mutateAsync: vi.fn(async () => 'created-group-id'), isPending: false },
    joinGroup: { mutateAsync: vi.fn(async () => 'joined-group-id'), isPending: false },
    toast: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => h.navigate
}))

vi.mock('@/features/group/api/useGroupMutations', () => ({
    useCreateGroup: () => h.createGroup,
    useJoinGroup: () => h.joinGroup
}))

vi.mock('sonner', () => ({
    toast: h.toast
}))

import GroupCreatePage from '../GroupCreatePage'

beforeAll(async () => {
    await i18nReady
    await i18next.changeLanguage('zh-TW')
    if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
    if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
})

function renderPage(): void {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    render(<GroupCreatePage />, { wrapper })
}

describe('GroupCreatePage', () => {
    beforeEach(() => {
        h.navigate.mockClear()
        h.createGroup.mutateAsync.mockClear()
        h.joinGroup.mutateAsync.mockClear()
        h.toast.success.mockClear()
        h.toast.error.mockClear()
    })

    it('uppercases invitation code before joining', async () => {
        renderPage()

        fireEvent.mouseDown(screen.getByRole('tab', { name: '加入群組' }), { button: 0 })
        fireEvent.change(screen.getByLabelText(/邀請碼/), { target: { value: 'ab12cd' } })
        fireEvent.click(screen.getByRole('button', { name: '加入群組' }))

        await waitFor(() => expect(h.joinGroup.mutateAsync).toHaveBeenCalledWith('AB12CD'))
    })
})
