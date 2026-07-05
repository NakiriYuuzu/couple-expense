import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/features/auth/authStore'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { STALE } from '@/shared/lib/queryClient'
import type { MonthlyReportRow } from '@/shared/lib/database.types'
import { monthlyReportDataSchema, type MonthlyReportRecord } from './useMonthlyReport'

export function useMonthlyReports() {
    const userId = useAuthStore((s) => s.user?.id ?? null)

    return useQuery({
        queryKey: queryKeys.monthlyReports(userId ?? ''),
        queryFn: async (): Promise<MonthlyReportRecord[]> => {
            const { data, error } = await supabase
                .from('monthly_reports')
                .select('*')
                .eq('user_id', userId as string)
                .order('year_month', { ascending: false })

            if (error) throw error

            const rows = (data ?? []) as MonthlyReportRow[]
            return rows.flatMap((row) => {
                const parsed = monthlyReportDataSchema.safeParse(row.data)
                if (!parsed.success) return []
                return [{ row, data: parsed.data }]
            })
        },
        // 報表層：monthly reports（列表）60s 緩存
        staleTime: STALE.standard,
        gcTime: STALE.standard,
        enabled: !!userId
    })
}
