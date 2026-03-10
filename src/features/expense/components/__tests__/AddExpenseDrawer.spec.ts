import { describe, expect, it } from 'vitest'
import addExpenseDrawerSource from '../AddExpenseDrawer.vue?raw'

describe('AddExpenseDrawer', () => {
    it('uses the drawer content selector as the popover teleport target', () => {
        expect(addExpenseDrawerSource).toContain(':to="`#${drawerContentId}`"')
    })

    it('emits the selected paidBy user for group expenses', () => {
        expect(addExpenseDrawerSource).toContain('paidBy: isGroupExpense.value ? splitData.value.paidBy : undefined')
    })

    it('keeps the amount field as a numeric form value', () => {
        expect(addExpenseDrawerSource).toContain('amount: z.number')
        expect(addExpenseDrawerSource).not.toContain("setFieldValue('amount', String(recent.amount))")
    })
})
