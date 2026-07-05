import { useTranslation } from 'react-i18next'
import { User, Users } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

// 範疇過濾 chips：取代原右上角 GroupSwitcher 的全域切換——預設顯示全部內容，
// 由各頁自行以此元件過濾（'all' | 'personal' | groupId）。
export type ExpenseScope = 'all' | 'personal' | string

interface Props {
    value: ExpenseScope
    onChange: (scope: ExpenseScope) => void
    groups: ReadonlyArray<{ id: string; name: string }>
    includeAll?: boolean
    includePersonal?: boolean
    className?: string
}

export function ScopeChips({
    value,
    onChange,
    groups,
    includeAll = true,
    includePersonal = true,
    className
}: Props) {
    const { t } = useTranslation()

    const chips: Array<{ scope: ExpenseScope; label: string; icon: typeof User | null }> = [
        ...(includeAll ? [{ scope: 'all' as const, label: t('dashboard.filterAll'), icon: null }] : []),
        ...(includePersonal
            ? [{ scope: 'personal' as const, label: t('dashboard.filterPersonal'), icon: User }]
            : []),
        ...groups.map((g) => ({ scope: g.id, label: g.name, icon: Users }))
    ]

    return (
        <div className={cn('flex gap-2 overflow-x-auto pb-1', className)} data-testid="scope-chips">
            {chips.map((chip) => (
                <button
                    key={chip.scope}
                    type="button"
                    onClick={() => onChange(chip.scope)}
                    aria-pressed={value === chip.scope}
                    className={cn(
                        'press-feedback flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                        value === chip.scope
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'glass text-muted-foreground hover:text-foreground'
                    )}
                >
                    {chip.icon && <chip.icon className="h-3.5 w-3.5" />}
                    <span className="max-w-32 truncate">{chip.label}</span>
                </button>
            ))}
        </div>
    )
}
