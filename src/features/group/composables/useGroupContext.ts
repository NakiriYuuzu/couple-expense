import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGroupStore } from '@/features/group/stores/group'

export function useGroupContext() {
    const { t } = useI18n()
    const groupStore = useGroupStore()

    const isPersonalMode = computed(() => groupStore.isPersonalContext)

    const activeGroupName = computed(() => groupStore.activeGroup?.name ?? null)

    const activeGroupId = computed(() => groupStore.activeGroupId)

    const contextLabel = computed(() => {
        if (groupStore.isPersonalContext) return t('expense.personal')
        return groupStore.activeGroup?.name ?? t('group.title')
    })

    return {
        isPersonalMode,
        activeGroupName,
        activeGroupId,
        contextLabel
    }
}
