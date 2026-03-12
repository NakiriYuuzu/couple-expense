<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check } from 'lucide-vue-next'
import { CategoryUtils } from '@/features/expense/composables/useCategories'
import SplitBadge from '@/features/split/components/SplitBadge.vue'
import type { ExpenseUser } from '@/entities/expense/types'
import type { SplitMethod } from '@/shared/lib/database.types'

const { t } = useI18n()

interface Props {
    id?: string
    title: string
    amount: string
    category: string
    icon: string
    user?: ExpenseUser
    showUser?: boolean
    groupName?: string | null
    splitMethod?: SplitMethod | null
    isSettled?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
    click: [expense: Props]
}>()

const handleClick = () => {
    emit('click', props)
}

// 使用 CategoryUtils 取得 icon 元件
const iconComponent = computed(() => {
    return CategoryUtils.getIconByKey(props.icon)
})

// 根據 category 動態選擇顏色（使用集中式顏色管理）
const categoryTailwind = computed(() => CategoryUtils.getCategoryTailwindClasses(props.category))
const iconBackgroundClass = computed(() => categoryTailwind.value.bg)
const iconColorClass = computed(() => categoryTailwind.value.text)
</script>

<template>
    <div
        class="glass-light rounded-2xl p-3 hover-transition cursor-pointer press-feedback"
        @click="handleClick"
    >
        <div class="flex items-center justify-between">
            <!-- 左側圖標和標題 -->
            <div class="flex items-center gap-3">
                <!-- 圖標容器 -->
                <div :class="[
                    'flex h-10 w-10 items-center justify-center rounded-xl',
                    iconBackgroundClass
                ]">
                    <component :is="iconComponent" class="h-5 w-5" :class="iconColorClass" />
                </div>

                <!-- 標題和使用者 -->
                <div class="flex-1">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <p class="text-sm font-medium text-card-foreground">
                            {{ title }}
                        </p>
                        <!-- 來自群組的 badge -->
                        <span
                            v-if="groupName"
                            class="glass-light text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 rounded-full border border-glass-border"
                        >
                            {{ t('expense.fromGroup', { name: groupName }) }}
                        </span>
                    </div>
                    <!-- 使用者名稱 -->
                    <p v-if="showUser && user" class="text-[11px] text-muted-foreground mt-0.5">
                        {{ user.display_name || t('expense.unknownUser') }}
                    </p>
                </div>
            </div>

            <!-- 右側：金額 + 分帳 badge + 結算標記 -->
            <div class="flex items-center gap-1">
                <SplitBadge v-if="splitMethod" :method="splitMethod" />
                <p class="text-sm font-semibold text-expense">
                    {{ amount }}
                </p>
                <Check v-if="isSettled" class="h-3 w-3 text-green-500 ml-1" />
            </div>
        </div>
    </div>
</template>

<style scoped>
</style>
