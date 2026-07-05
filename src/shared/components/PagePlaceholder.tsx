import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Phase 5 前的頁面內容佔位殼：標題卡 + pb-28（浮動導航留白）。
export function PagePlaceholder({ titleKey, children }: { titleKey: string; children?: ReactNode }) {
    const { t } = useTranslation()
    return (
        <div className="mx-auto w-full max-w-md px-4 pt-4 pb-28">
            <div className="glass rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-foreground">{t(titleKey)}</h2>
                {children ?? <p className="mt-2 text-sm text-muted-foreground">Phase 5</p>}
            </div>
        </div>
    )
}
