import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { registerResettable } from './reset'

// 帳號範疇的 client 狀態：目前作用中的群組（null = 個人模式）。
// persist 於 'ce-session'；SIGNED_OUT 由 reset() 清回個人模式。
interface SessionState {
    activeGroupId: string | null
    setActiveGroup: (id: string | null) => void
    reset: () => void
}

export const useSessionStore = create<SessionState>()(
    persist(
        (set) => ({
            activeGroupId: null,
            setActiveGroup: (activeGroupId) => set({ activeGroupId }),
            reset: () => set({ activeGroupId: null })
        }),
        { name: 'ce-session' }
    )
)

// 登入帳號切換/登出時，activeGroupId 必須清回個人模式，避免看到別帳號的群組。
registerResettable(() => useSessionStore.getState().reset())
