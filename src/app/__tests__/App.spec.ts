import { describe, expect, it } from 'vitest'
import appSource from '../App.vue?raw'

describe('App', () => {
    it('forwards group split payload when handling expense-added', () => {
        expect(appSource).toContain('paid_by: expense.paidBy')
        expect(appSource).toContain('splits: expense.splits')
    })
})
