import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'

// 多帳號清單（Q8 裁定：保留並優化）。相對 Vue accountManager 的差異：
//   - 刪除死欄位 sessionToken（Supabase 不支援多 session，無從用它還原）
//   - 不再持有 currentAccountId：「目前帳號」一律以 authStore.user.id 為準，
//     根除 Vue 版 currentAccount 與實際 session 脫鉤的 bug
export interface StoredAccount {
    id: string
    email: string
    displayName: string
    avatarUrl: string
    lastUsedAt: string
}

interface AccountState {
    accounts: StoredAccount[]
    isSwitching: boolean
    addOrUpdateAccount: (user: User) => void
    removeAccount: (id: string) => void
    setSwitching: (value: boolean) => void
}

export const useAccountStore = create<AccountState>()(
    persist(
        (set) => ({
            accounts: [],
            isSwitching: false,
            addOrUpdateAccount: (user) =>
                set((state) => {
                    const meta = user.user_metadata ?? {}
                    const account: StoredAccount = {
                        id: user.id,
                        email: user.email ?? '',
                        displayName:
                            (meta.full_name as string | undefined) ??
                            (meta.name as string | undefined) ??
                            '',
                        avatarUrl: (meta.avatar_url as string | undefined) ?? '',
                        lastUsedAt: new Date().toISOString()
                    }
                    const rest = state.accounts.filter((a) => a.id !== user.id)
                    return { accounts: [...rest, account] }
                }),
            removeAccount: (id) =>
                set((state) => ({ accounts: state.accounts.filter((a) => a.id !== id) })),
            setSwitching: (isSwitching) => set({ isSwitching })
        }),
        {
            name: 'ce-accounts',
            // 只持久化帳號清單；isSwitching 屬瞬時 UI 狀態不入庫
            partialize: (state) => ({ accounts: state.accounts })
        }
    )
)
