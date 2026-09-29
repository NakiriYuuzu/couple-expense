import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/features/auth/authStore'
import { signOut } from '@/features/auth/actions'
import { requestLineLink, type LineLinkError } from '@/features/line-link/api'

// LINE Bot 綁定頁：確認目前登入的帳號 → 取得 LINE 官方綁定網址 → 整頁導向 LINE。
export default function LineLinkPage({ linkToken }: { linkToken?: string }) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const email = useAuthStore((s) => s.user?.email)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<LineLinkError | null>(null)

    const handleLink = async () => {
        if (!linkToken) return
        setBusy(true)
        setError(null)
        const result = await requestLineLink(linkToken)
        if ('redirectUrl' in result) {
            window.location.assign(result.redirectUrl)
            return
        }
        setError(result.error)
        setBusy(false)
    }

    // 換帳號：登出後回登入頁，登入完成再回到本頁（保留 linkToken）。
    const handleSwitchAccount = async () => {
        setBusy(true)
        try {
            await signOut()
        } finally {
            void navigate({ to: '/', search: { redirect: `/line-link?linkToken=${encodeURIComponent(linkToken ?? '')}` } })
        }
    }

    return (
        <main className="glass-page-bg flex min-h-screen w-full flex-col items-center justify-center px-6 py-10">
            <div className="glass-elevated w-full max-w-sm rounded-2xl p-6 text-center">
                <h1 className="text-xl font-semibold">{t('lineLink.title')}</h1>
                {!linkToken ? (
                    <p className="mt-4 text-sm text-muted-foreground">{t('lineLink.invalidLink')}</p>
                ) : (
                    <>
                        <p className="mt-4 text-sm text-muted-foreground">{t('lineLink.confirmAccount')}</p>
                        <p className="mt-1 font-medium break-all">{email}</p>
                        {error && (
                            <p role="alert" className="mt-4 text-sm text-destructive">
                                {t(`lineLink.errors.${error}`)}
                            </p>
                        )}
                        <div className="mt-6 flex flex-col gap-2">
                            <Button onClick={handleLink} disabled={busy}>
                                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                                {t('lineLink.link')}
                            </Button>
                            <Button variant="ghost" onClick={handleSwitchAccount} disabled={busy}>
                                {t('lineLink.switchAccount')}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </main>
    )
}
