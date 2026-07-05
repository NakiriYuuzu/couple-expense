import { Toaster } from 'sonner'
import { useUiStore } from '@/shared/stores/ui'

// 全域 sonner Toaster，跟隨 ui store 的主題偏好（light/dark/system）。
export function AppToaster() {
    const theme = useUiStore((s) => s.theme)
    return <Toaster position="top-center" richColors theme={theme} />
}
