import type { ThemePref } from '@/shared/stores/ui'

// 主題套用的唯一真相：把有效主題（light/dark，system 依 prefers-color-scheme 解析）
// 反映到 document root 的 .dark class（對齊 main.css 的 @custom-variant dark）。
function prefersDark(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
    )
}

export function resolveEffectiveTheme(pref: ThemePref): 'light' | 'dark' {
    if (pref === 'system') return prefersDark() ? 'dark' : 'light'
    return pref
}

export function applyTheme(pref: ThemePref): void {
    if (typeof document === 'undefined') return
    const effective = resolveEffectiveTheme(pref)
    document.documentElement.classList.toggle('dark', effective === 'dark')
}
