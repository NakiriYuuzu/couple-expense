<template>
    <header class="sticky top-0 z-50 w-full glass">
        <div class="flex items-center gap-2 px-4 py-2">
            <!-- 返回按鈕 (可選) -->
            <Button
                v-if="showBackButton"
                variant="ghost"
                size="icon"
                class="h-9 w-9 shrink-0 rounded-full press-feedback hover-transition"
                @click="handleBack"
            >
                <ChevronLeft class="h-6 w-6" />
            </Button>

            <!-- 標題 (靠左) -->
            <h1 class="flex-1 text-lg font-semibold font-heading text-nav-foreground truncate">
                {{ displayTitle }}
            </h1>

            <!-- 右側自訂按鈕 -->
            <slot name="action" />

            <!-- GroupSwitcher -->
            <GroupSwitcher v-if="showGroupSwitcher && isInAnyGroup" />
        </div>
    </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { Button } from '@/shared/components/ui/button'
import { ChevronLeft } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useGroupStore } from '@/features/group/stores/group'
import GroupSwitcher from '@/features/group/components/GroupSwitcher.vue'

const { t } = useI18n()
const groupStore = useGroupStore()
const { isInAnyGroup } = storeToRefs(groupStore)

interface Props {
    title?: string
    showBackButton?: boolean
    showGroupSwitcher?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    title: '',
    showBackButton: false,
    showGroupSwitcher: true
})

const emit = defineEmits<{
    back: []
}>()

const handleBack = () => {
    emit('back')
}

const displayTitle = computed(() => props.title || t('nav.home'))
</script>
