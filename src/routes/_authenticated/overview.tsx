import { lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const OverviewPage = lazy(() => import('@/pages/overview/OverviewPage'))

export const Route = createFileRoute('/_authenticated/overview')({
    component: OverviewPage
})
