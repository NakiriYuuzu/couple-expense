import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useAuthStore } from '@/features/auth/authStore'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'
import { STALE } from '@/shared/lib/queryClient'
import type { MonthlyReportRow } from '@/shared/lib/database.types'
import type { MonthlyReportData } from '@/features/report/types'

export interface MonthlyReportRecord {
    row: MonthlyReportRow
    data: MonthlyReportData
}

export const monthlyReportDataSchema: z.ZodType<MonthlyReportData> = z.object({
    yearMonth: z.string(),
    personal: z.object({
        total: z.number(),
        expenseCount: z.number(),
        byCategory: z.array(
            z.object({
                category: z.string(),
                amount: z.number()
            })
        )
    }),
    group: z.object({
        splitTotal: z.number(),
        groups: z.array(
            z.object({
                groupId: z.string(),
                groupName: z.string(),
                splitAmount: z.number(),
                settledAmount: z.number(),
                unsettledAmount: z.number()
            })
        )
    }),
    mom: z.object({
        prevTotal: z.number(),
        delta: z.number(),
        deltaPct: z.number().nullable()
    }),
    generatedAt: z.string()
})

export function useMonthlyReport(yearMonth: string) {
    const userId = useAuthStore((s) => s.user?.id ?? null)

    return useQuery({
        queryKey: queryKeys.monthlyReport(userId ?? '', yearMonth),
        queryFn: async (): Promise<MonthlyReportRecord | null> => {
            const { data, error } = await supabase
                .from('monthly_reports')
                .select('*')
                .eq('user_id', userId as string)
                .eq('year_month', yearMonth)
                .maybeSingle()

            if (error) throw error
            if (!data) return null

            const parsed = monthlyReportDataSchema.safeParse((data as MonthlyReportRow).data)
            if (!parsed.success) throw parsed.error

            return { row: data as MonthlyReportRow, data: parsed.data }
        },
        // 報表層：monthly report（單筆）60s 緩存
        staleTime: STALE.standard,
        gcTime: STALE.standard,
        enabled: !!userId && !!yearMonth
    })
}
