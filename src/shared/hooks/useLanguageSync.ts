import { useEffect } from 'react'
import i18next from '@/shared/i18n'
import { useUiStore } from '@/shared/stores/ui'

// 把 ui store 的 language 反映到 i18next。
export function useLanguageSync(): void {
    const language = useUiStore((s) => s.language)
    useEffect(() => {
        if (i18next.language !== language) {
            void i18next.changeLanguage(language)
        }
    }, [language])
}
