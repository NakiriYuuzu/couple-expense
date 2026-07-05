import { Link } from '@tanstack/react-router'
import { LayoutDashboard, Receipt, PieChart, Plus, Settings } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

// 浮動膠囊導航。主新增操作固定在中間，與導航同步隱藏/出現。
// hidden 由上層 AuthenticatedLayout 依 useScrollDirection 計算後傳入（下捲隱藏、上捲出現）。
interface Props {
    activeTab: string
    hidden: boolean
    onAddExpenseClick: () => void
}

const tabs = [
    { key: 'dashboard', to: '/dashboard', Icon: LayoutDashboard },
    { key: 'expenses', to: '/expenses', Icon: Receipt },
    { key: 'overview', to: '/overview', Icon: PieChart },
    { key: 'settings', to: '/settings', Icon: Settings }
] as const

export function BottomNavigation({ activeTab, hidden, onAddExpenseClick }: Props) {
    const renderTab = ({ key, to, Icon }: (typeof tabs)[number]) => {
        const active = activeTab === key
        return (
            <Link
                key={key}
                to={to}
                aria-label={key}
                className="press-feedback hover-transition relative flex h-11 w-11 flex-col items-center justify-center rounded-full"
            >
                <Icon
                    className={cn(
                        'h-5 w-5 transition-colors duration-150',
                        active ? 'text-brand-primary' : 'text-muted-foreground'
                    )}
                />
                <span
                    className={cn(
                        'absolute bottom-0.5 h-1 w-1 rounded-full bg-brand-primary transition-all duration-200',
                        active ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                    )}
                />
            </Link>
        )
    }

    return (
        <nav
            className={cn(
                'glass-nav fixed left-1/2 z-50 -translate-x-1/2 rounded-full transition-transform duration-300 ease-out',
                hidden ? 'translate-y-24' : 'translate-y-0'
            )}
            style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
            <div className="flex items-center gap-1 px-2 py-1.5">
                {tabs.slice(0, 2).map(renderTab)}
                <button
                    type="button"
                    onClick={onAddExpenseClick}
                    aria-label="add-expense"
                    className="press-feedback hover-transition flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md"
                >
                    <Plus className="h-6 w-6" />
                </button>
                {tabs.slice(2).map(renderTab)}
            </div>
        </nav>
    )
}
