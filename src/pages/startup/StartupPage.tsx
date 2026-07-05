import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Mail, Lock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAccountStore } from '@/features/auth/accountStore'
import {
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    signInWithGoogle,
    switchToAccount
} from '@/features/auth/actions'
import { sanitizeRedirect } from '@/features/auth/redirect'
import { formatDateTime } from '@/shared/lib/datetime'

type Mode = 'signin' | 'signup' | 'reset'

// 登入頁（/ route 的內容）：email/password 表單 + Google + 註冊/忘記密碼切換
// + 已儲存帳號快速選擇卡。redirect 由 route 傳入，成功後回到原路徑（經白名單）。
// 唯一的 onAuthStateChange 註冊點在 AuthProvider——此頁不自行監聽（修 Vue 版 listener 洩漏）。
export default function StartupPage({ redirect }: { redirect?: string }) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const accounts = useAccountStore((s) => s.accounts)

    const [mode, setMode] = useState<Mode>('signin')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [busy, setBusy] = useState(false)

    const target = sanitizeRedirect(redirect)

    // email 登入成功後手動導航（OAuth 走回跳，由 guard 處理）。
    const goAfterLogin = () => {
        if (target) void navigate({ href: target })
        else void navigate({ to: '/dashboard' })
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        if (mode !== 'reset' && !email.trim()) {
            toast.error(t('auth.emailRequired'))
            return
        }
        if (mode === 'reset' && !email.trim()) {
            toast.error(t('auth.emailRequired'))
            return
        }
        if (mode !== 'reset' && !password) {
            toast.error(t('auth.passwordRequired'))
            return
        }

        setBusy(true)
        try {
            if (mode === 'signin') {
                await signInWithEmail(email.trim(), password)
                goAfterLogin()
            } else if (mode === 'signup') {
                await signUpWithEmail(email.trim(), password)
                toast.success(t('auth.signUpSuccess'))
                setMode('signin')
            } else {
                await sendPasswordReset(email.trim())
                toast.success(t('auth.resetSent'))
                setMode('signin')
            }
        } catch {
            const key =
                mode === 'signin'
                    ? 'auth.signInFailed'
                    : mode === 'signup'
                      ? 'auth.signUpFailed'
                      : 'auth.resetFailed'
            toast.error(t(key))
        } finally {
            setBusy(false)
        }
    }

    const handleGoogle = async () => {
        setBusy(true)
        try {
            await signInWithGoogle(target ?? undefined)
            // OAuth 全頁轉跳；回跳後由 guard 導向目標。
        } catch {
            setBusy(false)
            toast.error(t('auth.googleFailed'))
        }
    }

    const handleQuickSignIn = async (accountEmail: string) => {
        const account = accounts.find((a) => a.email === accountEmail)
        if (!account) return
        try {
            await switchToAccount(account, target ?? undefined)
        } catch {
            toast.error(t('auth.googleFailed'))
        }
    }

    return (
        <main className="glass-page-bg relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background px-6 py-10">
            <div className="animate-fade-up w-full max-w-sm">
                {/* Brand */}
                <div className="mb-8 text-center">
                    <h1 className="bg-gradient-to-br from-brand-primary to-brand-accent bg-clip-text text-5xl font-bold text-transparent">
                        {t('auth.brand')}
                    </h1>
                    <p className="mt-2 text-sm tracking-wide text-muted-foreground">
                        {t('auth.tagline')}
                    </p>
                </div>

                {/* Auth card */}
                <div className="glass-elevated rounded-2xl p-6">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="email">{t('auth.email')}</Label>
                            <div className="relative">
                                <Mail className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder={t('auth.emailPlaceholder')}
                                    className="pl-9"
                                    disabled={busy}
                                />
                            </div>
                        </div>

                        {mode !== 'reset' && (
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="password">{t('auth.password')}</Label>
                                <div className="relative">
                                    <Lock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        type="password"
                                        autoComplete={
                                            mode === 'signup' ? 'new-password' : 'current-password'
                                        }
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder={t('auth.passwordPlaceholder')}
                                        className="pl-9"
                                        disabled={busy}
                                    />
                                </div>
                            </div>
                        )}

                        {mode === 'reset' && (
                            <p className="text-xs text-muted-foreground">{t('auth.resetDesc')}</p>
                        )}

                        <Button type="submit" className="w-full" disabled={busy}>
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                            {mode === 'signin' && t(busy ? 'auth.signingIn' : 'auth.signIn')}
                            {mode === 'signup' && t(busy ? 'auth.signingUp' : 'auth.createAccount')}
                            {mode === 'reset' && t(busy ? 'auth.sending' : 'auth.sendReset')}
                        </Button>
                    </form>

                    {/* Mode toggles */}
                    <div className="mt-3 flex items-center justify-between text-xs">
                        {mode === 'signin' ? (
                            <>
                                <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => setMode('reset')}
                                >
                                    {t('auth.forgotPassword')}
                                </button>
                                <button
                                    type="button"
                                    className="font-medium text-brand-primary hover:underline"
                                    onClick={() => setMode('signup')}
                                >
                                    {t('auth.noAccount')}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className="text-brand-primary hover:underline"
                                onClick={() => setMode('signin')}
                            >
                                {mode === 'signup' ? t('auth.haveAccount') : t('auth.backToSignIn')}
                            </button>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="my-4 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs text-muted-foreground">{t('auth.or')}</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>

                    {/* Google */}
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={handleGoogle}
                        disabled={busy}
                    >
                        <GoogleIcon />
                        {t('auth.continueWithGoogle')}
                    </Button>
                </div>

                {/* Saved-account quick sign-in */}
                {accounts.length > 0 && (
                    <div className="mt-6">
                        <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                            {t('auth.quickSignIn')}
                        </p>
                        <div className="flex flex-col gap-2">
                            {accounts.map((account) => (
                                <button
                                    key={account.id}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleQuickSignIn(account.email)}
                                    className="glass-light press-feedback hover-transition flex items-center gap-3 rounded-xl p-3 text-left disabled:opacity-50"
                                >
                                    {account.avatarUrl ? (
                                        <img
                                            src={account.avatarUrl}
                                            alt=""
                                            className="h-9 w-9 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary/15 text-sm font-medium text-brand-primary">
                                            {(account.displayName || account.email || '?')
                                                .charAt(0)
                                                .toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {account.displayName || account.email}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {t('auth.lastUsed', {
                                                time: formatDateTime(account.lastUsedAt)
                                            })}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <p className="mt-6 text-center text-xs text-muted-foreground">v{__APP_VERSION__}</p>
            </div>
        </main>
    )
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
        </svg>
    )
}
