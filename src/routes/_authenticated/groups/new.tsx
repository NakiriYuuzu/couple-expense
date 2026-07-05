import { createFileRoute } from '@tanstack/react-router'
import GroupCreatePage from '@/pages/group-create/GroupCreatePage'

export const Route = createFileRoute('/_authenticated/groups/new')({
    component: GroupCreatePage
})
