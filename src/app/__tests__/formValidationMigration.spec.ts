import { describe, expect, it } from 'vitest'

import addExpenseDrawerSource from '@/features/expense/components/AddExpenseDrawer.vue?raw'
import settlementDrawerSource from '@/features/settlement/components/SettlementDrawer.vue?raw'
import expenseDetailPageSource from '@/pages/expense-detail/ExpenseDetailPage.vue?raw'
import groupSettingsPageSource from '@/pages/group/GroupSettingsPage.vue?raw'
import groupCreatePageSource from '@/pages/group-create/GroupCreatePage.vue?raw'
import settingsPageSource from '@/pages/settings/SettingsPage.vue?raw'

const formSources = [
    {
        name: 'GroupCreatePage',
        source: groupCreatePageSource
    },
    {
        name: 'GroupSettingsPage',
        source: groupSettingsPageSource
    },
    {
        name: 'SettingsPage personal budget drawer',
        source: settingsPageSource
    },
    {
        name: 'SettlementDrawer',
        source: settlementDrawerSource
    },
    {
        name: 'AddExpenseDrawer',
        source: addExpenseDrawerSource
    },
    {
        name: 'ExpenseDetailPage edit dialog',
        source: expenseDetailPageSource
    }
]

describe('form validation migration', () => {
    it.each(formSources)('migrates $name to vee-validate zod schemas', ({ source }) => {
        expect(source).toContain('useForm')
        expect(source).toContain("toTypedSchema")
        expect(source).toContain('validationSchema:')
        expect(source).toContain('handleSubmit')
    })

    it('removes hand-written validation from the group creation page', () => {
        expect(groupCreatePageSource).not.toContain('validateCreateForm')
        expect(groupCreatePageSource).not.toContain('validateJoinForm')
    })

    it('keeps numeric form fields as numbers instead of strings', () => {
        expect(addExpenseDrawerSource).toContain('amount: z.number')
        expect(expenseDetailPageSource).toContain('amount: z.number')
        expect(settlementDrawerSource).toContain('amount: z.number')
        expect(settingsPageSource).toContain('personalBudgetInput: z.number')
        expect(groupSettingsPageSource).toContain('monthly_budget: number | undefined')
        expect(groupSettingsPageSource).toContain('category_budgets: Record<CategoryBudgetKey, number | undefined>')
    })
})
