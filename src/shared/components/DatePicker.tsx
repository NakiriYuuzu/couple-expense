import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarIcon } from 'lucide-react'
import { enUS, zhTW } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/shared/lib/utils'

interface DatePickerProps {
    value: string
    onChange: (value: string) => void
    id?: string
    placeholder?: string
    'aria-label'?: string
    className?: string
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const pad2 = (value: number): string => String(value).padStart(2, '0')

function parseLocalDate(value: string): Date | undefined {
    if (!value) return undefined
    const match = DATE_PATTERN.exec(value)
    if (!match) return undefined

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date(year, month - 1, day)

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    )
        return undefined

    return date
}

function formatLocalDate(date: Date): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatDisplayDate(value: string): string {
    return value.replace(/-/g, '/')
}

export function DatePicker({
    value,
    onChange,
    id,
    placeholder = '',
    className,
    'aria-label': ariaLabel
}: DatePickerProps) {
    const { i18n } = useTranslation()
    const [open, setOpen] = useState(false)
    const selected = useMemo(() => parseLocalDate(value), [value])
    const locale = i18n.language.startsWith('zh') ? zhTW : enUS
    // 顯示以 parsed selected 為準：非法/溢位字串（如 2026-02-31）退回 placeholder，不顯示 raw value
    const label = selected ? formatDisplayDate(value) : placeholder

    const handleSelect = (date: Date | undefined) => {
        if (!date) return
        onChange(formatLocalDate(date))
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    aria-label={ariaLabel}
                    className={cn(
                        'w-full justify-start text-left font-normal',
                        !selected && 'text-muted-foreground',
                        className
                    )}
                >
                    <CalendarIcon className="h-4 w-4" />
                    <span>{label}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="pointer-events-auto z-[70] w-auto p-0"
                onOpenAutoFocus={event => event.preventDefault()}
            >
                <Calendar
                    mode="single"
                    required
                    selected={selected}
                    defaultMonth={selected}
                    onSelect={handleSelect}
                    locale={locale}
                />
            </PopoverContent>
        </Popover>
    )
}
