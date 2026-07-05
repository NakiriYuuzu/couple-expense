import { useEffect, useMemo, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { CalendarDays, ChevronRight, Crown, LogOut, Shield, User, Users, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/features/auth/authStore'
import { useGroups } from '@/features/group/api/useGroups'
import { useLeaveGroup, useUpdateGroupSettings } from '@/features/group/api/useGroupMutations'
import { cn } from '@/shared/lib/utils'
import type { CategoryBudgets, Currency, GroupMemberRole, GroupSettingsRow, GroupSettingsUpdate, SplitMethod } from '@/entities/group/types'
import type { Json } from '@/shared/lib/database.types'

interface Props {
    id: string
}

interface SettingsFormState {
    monthly_budget: string
    budget_start_day: string
    currency: Currency
    default_split_method: SplitMethod
    category_budgets: Record<keyof CategoryBudgets, string>
}

const categoryKeys: (keyof CategoryBudgets)[] = [
    'food',
    'transport',
    'shopping',
    'home',
    'pet',
    'other'
]

const currencies: Currency[] = ['TWD', 'USD', 'EUR', 'JPY', 'CNY']
const splitMethods: SplitMethod[] = ['equal', 'exact', 'percentage', 'shares']

function toRecord(value: Json | undefined): Partial<Record<keyof CategoryBudgets, number>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Partial<Record<keyof CategoryBudgets, number>>
}

function buildFormState(settings: GroupSettingsRow | null): SettingsFormState {
    const budgets = toRecord(settings?.category_budgets)
    return {
        monthly_budget: String(settings?.monthly_budget ?? 0),
        budget_start_day: String(settings?.budget_start_day ?? 1),
        currency: (settings?.currency ?? 'TWD') as Currency,
        default_split_method: (settings?.default_split_method ?? 'equal') as SplitMethod,
        category_budgets: {
            food: String(budgets.food ?? 0),
            transport: String(budgets.transport ?? 0),
            shopping: String(budgets.shopping ?? 0),
            home: String(budgets.home ?? 0),
            pet: String(budgets.pet ?? 0),
            other: String(budgets.other ?? 0)
        }
    }
}

function parseNonNegative(value: string): number | null {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return null
    return parsed
}

function formatDate(date: string, locale: string): string {
    if (!date) return ''
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(date))
}

function roleIcon(role: GroupMemberRole) {
    if (role === 'owner') return Crown
    if (role === 'admin') return Shield
    return User
}

function roleBadgeClass(role: GroupMemberRole): string {
    if (role === 'owner') return 'bg-brand-primary text-primary-foreground'
    if (role === 'admin') return 'bg-secondary text-secondary-foreground'
    return 'border border-glass-border bg-background/60 text-muted-foreground'
}

export default function GroupSettingsPage({ id }: Props) {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const currentUserId = useAuthStore((s) => s.user?.id ?? null)
    const { data, isLoading, isError } = useGroups()
    const updateSettings = useUpdateGroupSettings()
    const leaveGroup = useLeaveGroup()
    const [leaveOpen, setLeaveOpen] = useState(false)
    const [formError, setFormError] = useState('')

    const target = useMemo(() => data?.find((item) => item.group.id === id) ?? null, [data, id])
    const members = target?.members ?? []
    const currentRole = members.find((member) => member.user_id === currentUserId)?.role ?? 'member'
    const isOwner = currentRole === 'owner'
    const canManage = currentRole === 'owner' || currentRole === 'admin'
    const canLeave = !!target && !isOwner
    const [form, setForm] = useState<SettingsFormState>(() => buildFormState(null))

    useEffect(() => {
        if (target?.settings) setForm(buildFormState(target.settings))
    }, [target?.settings])

    const copyCode = async () => {
        const code = target?.group.invitation_code
        if (!code || !navigator.clipboard?.writeText) {
            toast.error(t('group.copyError'))
            return
        }

        try {
            await navigator.clipboard.writeText(code)
            toast.success(t('group.copySuccess'))
        } catch {
            toast.error(t('group.copyError'))
        }
    }

    const updateBudget = (key: keyof CategoryBudgets, value: string) => {
        setForm((current) => ({
            ...current,
            category_budgets: {
                ...current.category_budgets,
                [key]: value
            }
        }))
    }

    const handleSave = async (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault()
        const monthlyBudget = parseNonNegative(form.monthly_budget)
        const budgetStartDay = Number(form.budget_start_day)

        if (monthlyBudget === null || !Number.isInteger(budgetStartDay) || budgetStartDay < 1 || budgetStartDay > 28) {
            setFormError(t('validation.number'))
            return
        }

        const category_budgets = {} as CategoryBudgets
        for (const key of categoryKeys) {
            const value = parseNonNegative(form.category_budgets[key])
            if (value === null) {
                setFormError(t('validation.number'))
                return
            }
            category_budgets[key] = value
        }

        const patch: GroupSettingsUpdate = {
            monthly_budget: monthlyBudget,
            budget_start_day: budgetStartDay,
            currency: form.currency,
            default_split_method: form.default_split_method,
            category_budgets
        }

        setFormError('')
        try {
            await updateSettings.mutateAsync({ groupId: id, patch })
            toast.success(t('group.settingsSaved'))
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('group.saveError'))
        }
    }

    const handleLeave = async () => {
        try {
            await leaveGroup.mutateAsync(id)
            toast.success(t('group.leaveSuccess'))
            setLeaveOpen(false)
            void navigate({ to: '/dashboard' })
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('group.leaveError'))
        }
    }

    if (isLoading && !target) {
        return (
            <main className="space-y-4 px-4 pt-6 pb-28">
                <div className="glass h-32 animate-pulse rounded-2xl" />
                <div className="glass h-24 animate-pulse rounded-2xl" />
                <div className="glass h-48 animate-pulse rounded-2xl" />
            </main>
        )
    }

    if (!target) {
        return (
            <main className="flex flex-col items-center justify-center gap-4 px-4 pt-20 pb-28">
                <p className="text-muted-foreground">{isError ? t('group.fetchError') : t('group.notFound')}</p>
                <Button variant="outline" onClick={() => window.history.back()}>
                    {t('common.back')}
                </Button>
            </main>
        )
    }

    return (
        <main className="space-y-6 px-4 pt-6 pb-28">
            <section className="glass space-y-4 rounded-2xl p-5">
                <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent">
                        <Users className="h-5 w-5 text-brand-primary" />
                    </div>
                    <h2 className="text-base font-semibold text-foreground">{t('group.groupInfo')}</h2>
                </div>

                <div className="h-px bg-border" />

                <div className="space-y-3">
                    <div>
                        <p className="mb-1 text-xs text-muted-foreground">{t('group.groupName')}</p>
                        <p className="text-sm font-medium text-foreground">{target.group.name}</p>
                    </div>

                    {target.group.description && (
                        <div>
                            <p className="mb-1 text-xs text-muted-foreground">{t('group.groupDescription')}</p>
                            <p className="text-sm text-foreground">{target.group.description}</p>
                        </div>
                    )}

                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span>{t('group.createdAt')}: {formatDate(target.group.created_at, i18n.language)}</span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        <span>{t('group.memberCount', { count: members.length })}</span>
                    </div>
                </div>
            </section>

            <section className="glass-elevated space-y-4 rounded-2xl p-5">
                <div className="flex items-center gap-2">
                    <div className="glass-light flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-purple-600 dark:text-purple-400">
                        <ChevronRight className="h-5 w-5" />
                    </div>
                    <h2 className="text-base font-semibold text-foreground">{t('group.invitationCode')}</h2>
                </div>

                <div className="h-px bg-border" />

                {target.group.invitation_code ? (
                    <div className="flex items-center gap-2">
                        <code className="glass-light flex-1 rounded-xl px-4 py-3 text-center font-mono text-lg tracking-[0.25em] text-foreground">
                            {target.group.invitation_code}
                        </code>
                        <Button type="button" variant="outline" onClick={copyCode}>
                            {t('group.shareCode')}
                        </Button>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">{t('group.noInvitationCode')}</p>
                )}
            </section>

            <section className="glass space-y-4 rounded-2xl p-5">
                <div className="flex items-center gap-2">
                    <div className="glass-light flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-blue-600 dark:text-blue-400">
                        <Users className="h-5 w-5" />
                    </div>
                    <h2 className="text-base font-semibold text-foreground">{t('group.members')}</h2>
                </div>

                <div className="h-px bg-border" />

                <div className="space-y-2">
                    {members.map((member) => {
                        const RoleIcon = roleIcon(member.role)
                        return (
                            <div key={member.id} className="glass-light flex items-center gap-3 rounded-xl p-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary/15 text-sm font-semibold text-brand-primary">
                                    {member.user_id === currentUserId ? t('common.me').charAt(0) : member.user_id.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {member.user_id === currentUserId ? t('common.me') : member.user_id}
                                    </p>
                                </div>
                                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium', roleBadgeClass(member.role))}>
                                    <RoleIcon className="h-3 w-3" />
                                    {t(`group.${member.role}`)}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </section>

            {canManage && target.settings && (
                <section className="glass space-y-4 rounded-2xl p-5">
                    <div className="flex items-center gap-2">
                        <div className="glass-light flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-amber-600 dark:text-amber-400">
                            <Wallet className="h-5 w-5" />
                        </div>
                        <h2 className="text-base font-semibold text-foreground">{t('group.budgetSettings')}</h2>
                    </div>

                    <div className="h-px bg-border" />

                    <form className="space-y-5" onSubmit={handleSave}>
                        <div className="space-y-2">
                            <Label htmlFor="monthly-budget">{t('group.monthlyBudget')}</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">{form.currency}</span>
                                <Input
                                    id="monthly-budget"
                                    type="number"
                                    min="0"
                                    step="100"
                                    value={form.monthly_budget}
                                    placeholder={t('group.monthlyBudgetPlaceholder')}
                                    onChange={(event) => setForm((current) => ({ ...current, monthly_budget: event.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="budget-start-day">{t('group.budgetStartDay')}</Label>
                            <Select
                                value={form.budget_start_day}
                                onValueChange={(value) => setForm((current) => ({ ...current, budget_start_day: value }))}
                            >
                                <SelectTrigger id="budget-start-day" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 28 }, (_, index) => String(index + 1)).map((day) => (
                                        <SelectItem key={day} value={day}>
                                            {t('group.dayOfMonth', { day })}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="currency">{t('group.currency')}</Label>
                            <Select
                                value={form.currency}
                                onValueChange={(value) => setForm((current) => ({ ...current, currency: value as Currency }))}
                            >
                                <SelectTrigger id="currency" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {currencies.map((currency) => (
                                        <SelectItem key={currency} value={currency}>
                                            {currency}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="split-method">{t('group.defaultSplitMethod')}</Label>
                            <Select
                                value={form.default_split_method}
                                onValueChange={(value) => setForm((current) => ({ ...current, default_split_method: value as SplitMethod }))}
                            >
                                <SelectTrigger id="split-method" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {splitMethods.map((method) => (
                                        <SelectItem key={method} value={method}>
                                            {t(`group.split${method.charAt(0).toUpperCase()}${method.slice(1)}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <Label>{t('group.categoryBudgets')}</Label>
                            <div className="grid grid-cols-2 gap-3">
                                {categoryKeys.map((key) => (
                                    <div key={key} className="space-y-1">
                                        <Label htmlFor={`cat-${key}`} className="text-xs text-muted-foreground">
                                            {t(`expense.categories.${key}`)}
                                        </Label>
                                        <Input
                                            id={`cat-${key}`}
                                            type="number"
                                            min="0"
                                            step="100"
                                            value={form.category_budgets[key]}
                                            placeholder="0"
                                            onChange={(event) => updateBudget(key, event.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {formError && <p className="text-xs text-destructive">{formError}</p>}

                        <Button
                            type="submit"
                            className="press-feedback w-full bg-brand-primary text-primary-foreground hover:bg-brand-primary/90"
                            disabled={updateSettings.isPending}
                        >
                            {updateSettings.isPending ? t('common.saving') : t('common.save')}
                        </Button>
                    </form>
                </section>
            )}

            {canLeave && (
                <section className="glass space-y-4 rounded-2xl border border-destructive/30 p-5">
                    <div className="flex items-center gap-2">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                            <LogOut className="h-5 w-5 text-destructive" />
                        </div>
                        <h2 className="text-base font-semibold text-destructive">{t('group.dangerZone')}</h2>
                    </div>

                    <div className="h-px bg-destructive/20" />

                    <div className="space-y-3">
                        <div>
                            <p className="text-sm font-medium text-foreground">{t('group.leaveGroup')}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{t('group.leaveGroupDesc')}</p>
                        </div>
                        <Button variant="destructive" className="press-feedback w-full" onClick={() => setLeaveOpen(true)}>
                            <LogOut className="h-4 w-4" />
                            {t('group.leaveGroup')}
                        </Button>
                    </div>
                </section>
            )}

            {isOwner && (
                <section className="glass rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-brand-primary" />
                        <p className="text-xs text-muted-foreground">{t('group.ownerCannotLeave')}</p>
                    </div>
                </section>
            )}

            <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('group.leaveConfirmTitle')}</DialogTitle>
                        <DialogDescription>{t('group.leaveConfirmDesc')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLeaveOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="destructive" onClick={handleLeave} disabled={leaveGroup.isPending}>
                            {leaveGroup.isPending ? t('common.processing') : t('group.confirmLeave')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    )
}
