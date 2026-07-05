import { describe, it, expect } from 'vitest'
import { nextNavHidden } from '../useScrollDirection'

describe('nextNavHidden（浮動導航下捲隱藏/上捲出現）', () => {
    it('下捲超過門檻且已離頂 → 隱藏', () => {
        expect(nextNavHidden(false, { delta: 10, y: 100 })).toBe(true)
    })

    it('接近頁頂時下捲不隱藏（y ≤ 60 維持原狀）', () => {
        expect(nextNavHidden(false, { delta: 10, y: 40 })).toBe(false)
    })

    it('明顯上捲 → 顯示（即使原本隱藏）', () => {
        expect(nextNavHidden(true, { delta: -10, y: 300 })).toBe(false)
    })

    it('微小捲動維持原狀（抖動不切換）', () => {
        expect(nextNavHidden(true, { delta: 2, y: 300 })).toBe(true)
        expect(nextNavHidden(false, { delta: 2, y: 300 })).toBe(false)
        expect(nextNavHidden(true, { delta: -2, y: 300 })).toBe(true)
    })

    it('自訂門檻生效', () => {
        expect(nextNavHidden(false, { delta: 10, y: 100, threshold: 20 })).toBe(false)
        expect(nextNavHidden(false, { delta: 30, y: 100, threshold: 20 })).toBe(true)
    })
})
