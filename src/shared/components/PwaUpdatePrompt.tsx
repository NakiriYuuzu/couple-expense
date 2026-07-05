import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

// PWA 更新提示：對照 Vue 版 App.vue 的 useRegisterSW({ immediate: true }) + toast.info 行為
// （duration: Infinity + 更新/稍後再說兩個動作）。useRegisterSW 內部會自行完成 SW 註冊，
// 取代 main.tsx 過去直接呼叫的 registerSW({ immediate: true })，故只掛載一次、不重複註冊。
export function PwaUpdatePrompt() {
    const { t } = useTranslation()
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker
    } = useRegisterSW({ immediate: true })

    useEffect(() => {
        if (!needRefresh) return

        // __APP_VERSION__ 屬於目前正在執行的 bundle；SW 偵測到的新 bundle 版本號
        // 無法從舊 bundle 可靠取得，因此這裡只標示「目前執行版本」避免誤導。
        toast.info(t('pwa.updateAvailable'), {
            description: t('pwa.updateAvailableDesc', { version: __APP_VERSION__ }),
            duration: Infinity,
            action: {
                label: t('pwa.updateNow'),
                onClick: () => void updateServiceWorker(true)
            },
            cancel: {
                label: t('pwa.dismiss'),
                onClick: () => setNeedRefresh(false)
            }
        })
    }, [needRefresh, t, updateServiceWorker, setNeedRefresh])

    return null
}
