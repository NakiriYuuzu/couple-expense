import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, Crown, Plus, Shield, User, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/features/auth/authStore'
import { useGroups } from '@/features/group/api/useGroups'
import { useSessionStore } from '@/shared/stores/session'
import { cn } from '@/shared/lib/utils'
import type { GroupMemberRole, GroupWithDetails } from '@/entities/group/types'

const groupColors = [
    'bg-purple-500',
    'bg-blue-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500'
]

function getRole(group: GroupWithDetails, currentUserId: string | null): GroupMemberRole {
    return group.members.find((member) => member.user_id === currentUserId)?.role ?? 'member'
}

function getRoleIcon(role: GroupMemberRole) {
    if (role === 'owner') return Crown
    if (role === 'admin') return Shield
    return User
}

function getRoleBadgeClass(role: GroupMemberRole): string {
    if (role === 'owner') return 'bg-brand-primary text-primary-foreground'
    if (role === 'admin') return 'bg-secondary text-secondary-foreground'
    return 'border border-glass-border bg-background/60 text-muted-foreground'
}

function formatDate(date: string, locale: string): string {
    if (!date) return ''
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(date))
}

export default function GroupListPage() {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const currentUserId = useAuthStore((s) => s.user?.id ?? null)
    const activeGroupId = useSessionStore((s) => s.activeGroupId)
    const { data, isLoading, isError } = useGroups()
    const groups = data ?? []

    const goCreate = () => navigate({ to: '/groups/new' })
    const goGroup = (id: string) => navigate({ to: '/groups/$id', params: { id } })

    if (isLoading && groups.length === 0) {
        return (
            <main className="px-4 pt-6 pb-28">
                <div className="space-y-3">
                    {[1, 2, 3].map((item) => (
                        <div key={item} className="glass h-24 animate-pulse rounded-2xl" />
                    ))}
                </div>
            </main>
        )
    }

    return (
        <main className="px-4 pt-6 pb-28">
            {isError && (
                <div className="glass mb-4 rounded-2xl p-4 text-sm text-destructive">
                    {t('group.fetchError')}
                </div>
            )}

            {groups.length === 0 ? (
                <section className="flex flex-col items-center justify-center gap-6 pt-20 text-center">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-accent">
                        <Users className="h-12 w-12 text-brand-primary" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-lg font-semibold text-foreground">{t('group.noGroupsTitle')}</h2>
                        <p className="text-sm text-muted-foreground">{t('group.noGroupsDesc')}</p>
                    </div>
                    <Button className="press-feedback bg-brand-primary text-primary-foreground hover:bg-brand-primary/90" onClick={goCreate}>
                        <Plus className="h-4 w-4" />
                        {t('group.createOrJoin')}
                    </Button>
                </section>
            ) : (
                <section className="space-y-3">
                    {groups.map((group, index) => {
                        const role = getRole(group, currentUserId)
                        const RoleIcon = getRoleIcon(role)
                        const isActive = activeGroupId === group.group.id
                        const color = groupColors[index % groupColors.length]
                        const memberCount = group.memberCount ?? group.members.length

                        return (
                            <button
                                key={group.group.id}
                                type="button"
                                className={cn(
                                    'glass press-feedback hover-transition relative w-full overflow-hidden rounded-2xl p-4 text-left',
                                    isActive && 'border-brand-primary ring-1 ring-brand-primary'
                                )}
                                onClick={() => goGroup(group.group.id)}
                            >
                                <span className={cn('absolute inset-x-0 top-0 h-1', color)} />
                                {isActive && <span className="absolute top-0 bottom-0 left-0 w-1 bg-brand-primary" />}

                                <span className="flex items-center gap-3">
                                    <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white', color)}>
                                        {group.group.name.charAt(0).toUpperCase()}
                                    </span>

                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-2">
                                            <span className="truncate text-base font-semibold text-foreground">
                                                {group.group.name}
                                            </span>
                                            {isActive && (
                                                <span className="rounded-full bg-brand-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                                                    {t('group.active')}
                                                </span>
                                            )}
                                        </span>
                                        <span className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                {t('group.memberCount', { count: memberCount })}
                                            </span>
                                            <span>{formatDate(group.group.created_at, i18n.language)}</span>
                                        </span>
                                    </span>

                                    <span className="flex shrink-0 items-center gap-2">
                                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium', getRoleBadgeClass(role))}>
                                            <RoleIcon className="h-3 w-3" />
                                            {t(`group.${role}`)}
                                        </span>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </span>
                                </span>
                            </button>
                        )
                    })}

                    <Button
                        type="button"
                        size="lg"
                        className="press-feedback fixed right-6 bottom-6 h-14 w-14 rounded-full bg-brand-primary text-primary-foreground shadow-lg hover:bg-brand-primary/90"
                        onClick={goCreate}
                        aria-label={t('group.createOrJoin')}
                    >
                        <Plus className="h-6 w-6" />
                    </Button>
                </section>
            )}
        </main>
    )
}
