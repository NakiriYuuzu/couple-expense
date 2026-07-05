import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { queryKeys } from '@/shared/lib/queryKeys'

export function useMarkReportRead() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: { userId: string; yearMonth: string }): Promise<void> => {
            const { error } = await supabase
                .from('monthly_reports')
                .update({ read_at: new Date().toISOString() })
                .eq('user_id', input.userId)
                .eq('year_month', input.yearMonth)
            if (error) throw error
        },
        onSuccess: (_data, variables) => {
            client.invalidateQueries({ queryKey: queryKeys.monthlyReports(variables.userId) })
        }
    })
}
