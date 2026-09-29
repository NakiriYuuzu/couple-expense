import { createFileRoute } from '@tanstack/react-router'
import LineLinkPage from '@/pages/line-link/LineLinkPage'
import { requireAuth } from '@/features/auth/guard'

// LINE Bot 綁定頁。未登入 → requireAuth 帶原網址（含 linkToken）回登入頁，登入後回到這裡。
// 不放在 _authenticated 底下，避免載入 App 的導覽列與群組守衛。
export const Route = createFileRoute('/line-link')({
    validateSearch: (search: Record<string, unknown>): { linkToken?: string } => ({
        linkToken: typeof search.linkToken === 'string' ? search.linkToken : undefined
    }),
    beforeLoad: requireAuth,
    component: LineLinkRoute
})

function LineLinkRoute() {
    const { linkToken } = Route.useSearch()
    return <LineLinkPage linkToken={linkToken} />
}
