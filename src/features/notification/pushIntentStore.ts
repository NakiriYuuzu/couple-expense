import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 推播「使用者已明確開啟」的意圖旗標，per-user 記錄於 'ce-push-intent'。
// 與 user_devices／Notification.permission 的關係：這兩者都可能維持「granted／已註冊」
// 不變，但使用者仍可能透過本頁主開關表達「不要」——本旗標就是這個獨立於瀏覽器層級
// 狀態的使用者意圖來源，主開關的視覺狀態與掛載時是否要靜默刷新 token 都以此為準
// （否則只看 Notification.permission 的話，使用者關閉開關後只要瀏覽器權限仍是 granted，
// 下次開 app 就會被靜默重新註冊，形同「關閉」沒有作用）。
//
// per-user（以陣列存 userId）而非單一 boolean：多帳號裝置上 A 帳號的意圖不該影響 B 帳號。
// 不註冊 registerResettable：故意讓它跨 SIGNED_OUT／切換帳號存活——per-user 陣列本身已用
// userId 隔離、不會有跨帳號洩漏，語意上更接近 ui.ts 的 theme/language（裝置偏好，登出不清）
// 而非 session.ts 的 activeGroupId（必須在登出時清空的帳號態）。
interface PushIntentState {
    enabledUserIds: string[]
    enable: (userId: string) => void
    disable: (userId: string) => void
}

export const usePushIntentStore = create<PushIntentState>()(
    persist(
        (set) => ({
            enabledUserIds: [],
            enable: (userId) =>
                set((state) => ({
                    enabledUserIds: state.enabledUserIds.includes(userId)
                        ? state.enabledUserIds
                        : [...state.enabledUserIds, userId]
                })),
            disable: (userId) =>
                set((state) => ({
                    enabledUserIds: state.enabledUserIds.filter((id) => id !== userId)
                }))
        }),
        { name: 'ce-push-intent' }
    )
)
