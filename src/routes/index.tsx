import { createFileRoute } from '@tanstack/react-router'
import StartupPage from '@/pages/startup/StartupPage'
import { redirectIfAuthed } from '@/features/auth/guard'

// '/' = startup（登入頁）。已登入 → redirectIfAuthed 導向 redirect 目標或 /dashboard。
// redirect search param 帶動回登後還原原路徑（經站內白名單）。
export const Route = createFileRoute('/')({
    validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
        redirect: typeof search.redirect === 'string' ? search.redirect : undefined
    }),
    beforeLoad: redirectIfAuthed,
    component: StartupRoute
})

function StartupRoute() {
    const { redirect } = Route.useSearch()
    return <StartupPage redirect={redirect} />
}
