import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
    title: string
    showBackButton?: boolean
    onBack?: () => void
    action?: ReactNode
}

export function TopBar({
    title,
    showBackButton = false,
    onBack,
    action
}: Props) {
    return (
        <header className="glass sticky top-0 z-40 w-full">
            <div className="flex items-center gap-2 px-4 py-2">
                {showBackButton && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="press-feedback hover-transition h-9 w-9 shrink-0 rounded-full"
                        onClick={onBack}
                        aria-label="back"
                    >
                        <ChevronLeft className="h-6 w-6" />
                    </Button>
                )}
                <h1 className="flex-1 truncate text-lg font-semibold text-foreground">{title}</h1>
                {action}
            </div>
        </header>
    )
}
