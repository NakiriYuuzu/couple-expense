import { createFileRoute } from '@tanstack/react-router'
import ExpenseDetailPage from '@/pages/expense-detail/ExpenseDetailPage'

export const Route = createFileRoute('/_authenticated/expenses/$id')({
    component: ExpenseDetailRoute
})

function ExpenseDetailRoute() {
    const { id } = Route.useParams()
    return <ExpenseDetailPage id={id} />
}
