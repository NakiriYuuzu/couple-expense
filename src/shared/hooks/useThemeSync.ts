import { useEffect } from 'react'
import { useUiStore } from '@/shared/stores/ui'
import { applyTheme } from '@/shared/lib/theme'

// 把 ui store 的 theme 反映到 document root；system 模式下追蹤 prefers-color-scheme 變動。
export function useThemeSync(): void {
    const theme = useUiStore((s) => s.theme)

    useEffect(() => {
        applyTheme(theme)
        if (theme !== 'system') return
        if (typeof window.matchMedia !== 'function') return

        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const onChange = () => applyTheme('system')
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [theme])
}
