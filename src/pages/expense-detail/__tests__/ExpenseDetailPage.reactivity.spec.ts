import { describe, expect, it } from 'vitest'
import expenseDetailPageSource from '../ExpenseDetailPage.vue?raw'

describe('ExpenseDetailPage reactivity', () => {
    it('does not use refs for the editable form model', () => {
        expect(expenseDetailPageSource).not.toContain('const editForm = ref({')
        expect(expenseDetailPageSource).not.toContain('const editForm = shallowRef({')
    })

    it('uses vee-validate form state for the edit dialog', () => {
        expect(expenseDetailPageSource).toContain('useForm({')
        expect(expenseDetailPageSource).toContain('values: editForm')
        expect(expenseDetailPageSource).toContain('handleSubmit: handleEditSubmit')
        expect(expenseDetailPageSource).toContain('resetForm: resetEditForm')
    })

    it('keeps split configuration in refs because it is managed outside the form schema', () => {
        expect(expenseDetailPageSource).toContain('const editSplitData = ref<{')
    })
})
