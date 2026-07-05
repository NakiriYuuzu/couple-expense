import { memo, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { CategoryUtils } from '@/features/expense/lib/categories'
import { cn } from '@/shared/lib/utils'
import type { ExpenseUser } from '@/entities/expense/types'
import type { SplitMethod } from '@/shared/lib/database.types'

// 單筆費用列（Phase 5.1，對照 Vue ExpenseItem.vue）。純展示元件：金額已由父層以 formatCurrency
// 格式化成字串傳入（amount），本元件不自行格式化金額。類別 icon / 顏色走 CategoryUtils 集中管理。
// 分帳方式以文字 badge 呈現（Vue 用 SplitBadge 元件；此處未建 SplitBadge，以 t('split.methods.*')
// 文字 badge 等效替代，避免新增未列於任務的元件）。

interface Props {
    title: string
    // 已格式化的金額字串（父層走 formatCurrency + 作用中群組幣別）
    amount: string
    category: string
    icon: string
    user?: ExpenseUser
    showUser?: boolean
    groupName?: string | null
    splitMethod?: SplitMethod | null
    isSettled?: boolean
    onClick?: () => void
}

// [memo] 行元件在虛擬化清單中頻繁重繪，避免未變動的列因父層 rerender 重刷。
export const ExpenseItem = memo(function ExpenseItem({
    title,
    amount,
    category,
    icon,
    user,
    showUser = false,
    groupName = null,
    splitMethod = null,
    isSettled = false,
    onClick
}: Props) {
    const { t } = useTranslation()
    const Icon = CategoryUtils.getIconByKey(icon)
    const tw = CategoryUtils.getCategoryTailwindClasses(category)
    const clickable = !!onClick

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!clickable) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onClick()
    }

    return (
        <div
            className={cn(
                'glass-light hover-transition press-feedback rounded-2xl p-3',
                clickable && 'cursor-pointer'
            )}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
        >
            <div className="flex items-center justify-between">
                {/* 左側：圖標 + 標題 */}
                <div className="flex min-w-0 items-center gap-3">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tw.bg)}>
                        <Icon className={cn('h-5 w-5', tw.text)} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-medium text-card-foreground">{title}</p>
                            {groupName && (
                                <span className="glass-light rounded-full border border-glass-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {t('expense.fromGroup', { name: groupName })}
                                </span>
                            )}
                        </div>
                        {showUser && user && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {user.display_name || t('expense.unknownUser')}
                            </p>
                        )}
                    </div>
                </div>

                {/* 右側：分帳 badge + 金額 + 結算標記 */}
                <div className="flex shrink-0 items-center gap-1">
                    {splitMethod && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {t(`split.methods.${splitMethod}`)}
                        </span>
                    )}
                    <p className="text-sm font-semibold text-expense">{amount}</p>
                    {isSettled && <Check className="ml-1 h-3 w-3 text-green-500" />}
                </div>
            </div>
        </div>
    )
})
