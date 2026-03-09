<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import { CategoryUtils } from '@/features/expense/composables/useCategories'
import SplitBadge from '@/features/split/components/SplitBadge.vue'
import type { ExpenseUser } from '@/entities/expense/types'
import type { SplitMethod } from '@/shared/lib/database.types'

interface Props {
    id?: string
    title: string
    amount: string
    category: string
    icon: string
    user?: ExpenseUser
    showUser?: boolean
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

// 統一使用 brand 顏色
const iconBackgroundClass = 'bg-brand-accent'
const iconColorClass = 'text-brand-primary'
</script>

<template>
    <div
        class="bg-card rounded-[10px] p-3 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
        @click="handleClick"
    >
        <div class="flex items-center justify-between">
            <!-- 左側圖標和標題 -->
            <div class="flex items-center gap-3">
                <!-- 圖標容器 -->
                <div :class="[
                    'flex h-5 w-5 items-center justify-center rounded-[4px]',
                    iconBackgroundClass
                ]">
                    <component :is="iconComponent" class="h-3 w-3" :class="iconColorClass" />
                </div>

                <!-- 標題和使用者 -->
                <div class="flex-1">
                    <p class="text-[13px] font-normal text-card-foreground">
                        {{ title }}
                    </p>
                    <!-- 使用者名稱 -->
                    <p v-if="showUser && user" class="text-[11px] text-muted-foreground mt-0.5">
                        {{ user.display_name || '未知使用者' }}
                    </p>
                </div>
            </div>

            <!-- 右側：金額 + 分帳 badge + 結算標記 -->
            <div class="flex items-center gap-1">
                <SplitBadge v-if="splitMethod" :method="splitMethod" />
                <p class="text-[13px] font-normal text-expense">
                    {{ amount }}
                </p>
                <Check v-if="isSettled" class="h-3 w-3 text-green-500 ml-1" />
            </div>
        </div>
    </div>
</template>

<style scoped>
</style>