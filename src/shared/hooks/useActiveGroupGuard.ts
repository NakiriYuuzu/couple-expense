import { useEffect } from 'react'
import { useGroups } from '@/features/group/api/useGroups'
import { useSessionStore } from '@/shared/stores/session'

// activeGroup 逐出守衛（修 Phase 4 延後項）：
// 當 sessionStore.activeGroupId 指向的群組已不在 ['groups'] 清單中（被踢出 / 主動離開 /
// 切帳號殘留），回退個人模式（setActiveGroup(null)）。
//
// 為何需要：GroupSwitcher 移除後，activeGroupId 僅剩「上次記帳使用的範疇」語意
//（AddExpenseDrawer / RecurringExpenseDrawer 預設群組）。若 store 殘留已離開群組的
// 陳舊 groupId，新增費用會預設寫入無權限的群組。useActiveGroup 派生層雖能「顯示」
// 回退為個人，但不改動 store——真正把 store 收斂回 null 的單一責任放在此守衛，
// 於 _authenticated 佈局掛一次。
//
// 收斂前置條件（避免誤逐）：
//   - activeGroupId 為 null → 已是個人模式，無需處理。
//   - groups query 尚未成功載入（isSuccess=false / data undefined）→ 不可判定「不在清單」，
//     否則初次載入時會把合法的 activeGroupId 誤清成 null。僅在成功載入後才比對。
export function useActiveGroupGuard(): void {
    const activeGroupId = useSessionStore((s) => s.activeGroupId)
    const setActiveGroup = useSessionStore((s) => s.setActiveGroup)
    const { data, isSuccess } = useGroups()

    useEffect(() => {
        if (!activeGroupId) return
        if (!isSuccess || !data) return
        const stillMember = data.some((g) => g.group.id === activeGroupId)
        if (!stillMember) setActiveGroup(null)
    }, [activeGroupId, data, isSuccess, setActiveGroup])
}
