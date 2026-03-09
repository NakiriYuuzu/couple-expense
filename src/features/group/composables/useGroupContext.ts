import { computed } from 'vue'
import { useGroupStore } from '@/features/group/stores/group'

export function useGroupContext() {
    const groupStore = useGroupStore()

    const isPersonalMode = computed(() => groupStore.isPersonalContext)

    const activeGroupName = computed(() => groupStore.activeGroup?.name ?? null)

    const activeGroupId = computed(() => groupStore.activeGroupId)

    const contextLabel = computed(() => {
        if (groupStore.isPersonalContext) return '個人'
        return groupStore.activeGroup?.name ?? '群組'
    })

    return {
        isPersonalMode,
        activeGroupName,
        activeGroupId,
        contextLabel
    }
}
