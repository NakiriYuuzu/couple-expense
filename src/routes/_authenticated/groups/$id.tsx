import { createFileRoute } from '@tanstack/react-router'
import GroupSettingsPage from '@/pages/group/GroupSettingsPage'

export const Route = createFileRoute('/_authenticated/groups/$id')({
    component: GroupSettingsRoute
})

function GroupSettingsRoute() {
    const { id } = Route.useParams()
    return <GroupSettingsPage id={id} />
}
