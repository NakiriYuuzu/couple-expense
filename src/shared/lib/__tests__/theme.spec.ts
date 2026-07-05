import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveEffectiveTheme, applyTheme } from '../theme'
import { useUiStore } from '@/shared/stores/ui'
import { useSessionStore } from '@/shared/stores/session'
import { resetAllStores } from '@/shared/stores/reset'
import '@/shared/stores'

function mockPrefersDark(matches: boolean) {
    return vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    } as unknown as MediaQueryList)
}

afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.classList.remove('dark')
})

describe('theme（.dark class 唯一真相）', () => {
    it('light/dark 直接生效', () => {
        applyTheme('dark')
        expect(document.documentElement.classList.contains('dark')).toBe(true)
        applyTheme('light')
        expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('system 依 prefers-color-scheme 解析', () => {
        mockPrefersDark(true)
        expect(resolveEffectiveTheme('system')).toBe('dark')
        applyTheme('system')
        expect(document.documentElement.classList.contains('dark')).toBe(true)

        vi.restoreAllMocks()
        mockPrefersDark(false)
        expect(resolveEffectiveTheme('system')).toBe('light')
        applyTheme('system')
        expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('ui store 三態切換', () => {
        useUiStore.getState().setTheme('dark')
        expect(useUiStore.getState().theme).toBe('dark')
        useUiStore.getState().setTheme('system')
        expect(useUiStore.getState().theme).toBe('system')
    })

    it('登出清理不重設裝置偏好（theme 保留、session 清回個人模式）', () => {
        useUiStore.getState().setTheme('dark')
        useSessionStore.getState().setActiveGroup('g-9')

        resetAllStores()

        expect(useUiStore.getState().theme).toBe('dark')
        expect(useSessionStore.getState().activeGroupId).toBeNull()
    })
})
