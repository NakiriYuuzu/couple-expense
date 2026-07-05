import { lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))

export const Route = createFileRoute('/_authenticated/settings')({
    component: SettingsPage
})
