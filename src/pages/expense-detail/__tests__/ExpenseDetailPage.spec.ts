import { describe, expect, it } from 'vitest'
import expenseDetailPageSource from '../ExpenseDetailPage.vue?raw'

describe('ExpenseDetailPage', () => {
    it('renders split configurator in the edit dialog for group expenses', () => {
        expect(expenseDetailPageSource).toContain('<SplitConfigurator')
        expect(expenseDetailPageSource).toContain('v-model:split-method="editSplitData.splitMethod"')
        expect(expenseDetailPageSource).toContain('v-model:participants="editSplitData.participants"')
    })

    it('updates expense splits when saving group expense edits', () => {
        expect(expenseDetailPageSource).toContain('await splitStore.updateExpenseSplits(expense.value.id, splitPayload)')
        expect(expenseDetailPageSource).toContain('split_method: editSplitData.value.splitMethod')
        expect(expenseDetailPageSource).toContain('paid_by: editSplitData.value.paidBy')
    })

    it('uses a scrollable dialog layout so footer actions stay reachable', () => {
        expect(expenseDetailPageSource).toContain('<DialogScrollContent')
        expect(expenseDetailPageSource).toContain('overflow-y-auto px-6 py-4')
        expect(expenseDetailPageSource).toContain('border-t border-border bg-background px-6 py-4')
    })

    it('renders split participant display names instead of raw user ids', () => {
        expect(expenseDetailPageSource).toContain('const detailedSplits = computed(() =>')
        expect(expenseDetailPageSource).toContain("displayName: splitProfiles.value[split.user_id]?.displayName ?? null")
        expect(expenseDetailPageSource).toContain("{{ split.displayName || t('expense.unknownUser', '未知使用者') }}")
    })
})
