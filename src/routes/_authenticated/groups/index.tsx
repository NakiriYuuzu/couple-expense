import { createFileRoute } from '@tanstack/react-router'
import GroupListPage from '@/pages/group-list/GroupListPage'

export const Route = createFileRoute('/_authenticated/groups/')({
    component: GroupListPage
})
