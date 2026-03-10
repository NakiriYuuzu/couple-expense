import { describe, expect, it } from 'vitest'
import addExpenseDrawerSource from '../../features/expense/components/AddExpenseDrawer.vue?raw'
import settlementDrawerSource from '../../features/settlement/components/SettlementDrawer.vue?raw'
import expenseDetailPageSource from '../../pages/expense-detail/ExpenseDetailPage.vue?raw'
import groupCreatePageSource from '../../pages/group-create/GroupCreatePage.vue?raw'
import groupSettingsPageSource from '../../pages/group/GroupSettingsPage.vue?raw'
import settingsPageSource from '../../pages/settings/SettingsPage.vue?raw'

const formSources = [
    {
        name: 'AddExpenseDrawer',
        source: addExpenseDrawerSource
    },
    {
        name: 'SettlementDrawer',
        source: settlementDrawerSource
    },
    {
        name: 'ExpenseDetailPage',
        source: expenseDetailPageSource
    },
    {
        name: 'GroupCreatePage',
        source: groupCreatePageSource
    },
    {
        name: 'GroupSettingsPage',
        source: groupSettingsPageSource
    },
    {
        name: 'SettingsPage',
        source: settingsPageSource
    }
]

describe('form validation adoption', () => {
    it.each(formSources)('$name uses vee-validate with a zod schema', ({ source }) => {
        expect(source).toContain('useForm')
        expect(source).toContain('toTypedSchema(')
    })
})
