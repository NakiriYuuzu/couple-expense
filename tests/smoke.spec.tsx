import { describe, it, expect } from 'vitest'
import { MemoryStorage, isUsable } from './setup'

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

    it('the guard detects broken storage and its replacement is usable', () => {
        // 直接驗 guard 的組件行為（環境無關）：健康環境（如 CI 的 happy-dom Storage）
        // guard 不接管、Node 25 壞 localStorage 則以 MemoryStorage 接管——兩者都合法。
        // 舊斷言寫死 constructor.name === 'MemoryStorage'，在健康環境誤炸。
        expect(isUsable(undefined)).toBe(false)
        expect(isUsable({ getItem: undefined })).toBe(false)
        expect(isUsable(new MemoryStorage())).toBe(true)

        // 現行環境的 storage 必須可用——無論來源是環境原生或 guard 接管
        expect(isUsable(globalThis.localStorage)).toBe(true)
        expect(isUsable(globalThis.sessionStorage)).toBe(true)
    })
})
