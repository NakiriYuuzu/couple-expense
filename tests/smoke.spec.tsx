import { describe, it, expect } from 'vitest'

// Node 25 內建 localStorage（無 --localstorage-file）的炸彈由 tests/setup.ts 的
// guard 拆除；此檔釘死該防護持續有效。真實 shell 的 render 覆蓋在各頁 RTL 測試。
describe('storage guard smoke', () => {
    it('has a usable localStorage (Node 25 bomb defused)', () => {
        expect(typeof localStorage.getItem).toBe('function')
        expect(typeof localStorage.setItem).toBe('function')

        localStorage.setItem('smoke-key', 'smoke-value')
        expect(localStorage.getItem('smoke-key')).toBe('smoke-value')

        localStorage.removeItem('smoke-key')
        expect(localStorage.getItem('smoke-key')).toBeNull()
    })

    it('storage comes from the setup.ts guard, not a lucky environment', () => {
        // setup.ts 的 guard 必須實際接管；此斷言防止 guard 未來默默變成 dead code
        expect(localStorage.constructor.name).toBe('MemoryStorage')
    })
})
