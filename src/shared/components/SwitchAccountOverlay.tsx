import { useTranslation } from 'react-i18next'
import { useAccountStore } from '@/features/auth/accountStore'

// 帳號切換中的全屏 loading 態，避免 OAuth 回跳前舊帳號資料閃現。
export function SwitchAccountOverlay() {
    const { t } = useTranslation()
    const isSwitching = useAccountStore((s) => s.isSwitching)
    if (!isSwitching) return null

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-brand-primary" />
            <p className="text-sm text-muted-foreground">{t('settings.switchingAccount')}</p>
        </div>
    )
}
