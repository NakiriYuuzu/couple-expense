import { lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const MonthlyReportPage = lazy(() => import('@/pages/reports/MonthlyReportPage'))

export const Route = createFileRoute('/_authenticated/reports/$yearMonth')({
    component: MonthlyReportRoute
})

function MonthlyReportRoute() {
    const { yearMonth } = Route.useParams()
    return <MonthlyReportPage yearMonth={yearMonth} />
}
