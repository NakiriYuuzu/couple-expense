<template>
    <Card class="cursor-pointer border-0 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1">
        <CardContent class="flex items-center justify-between p-4">
            <!-- 左側圖標和標題 -->
            <div class="flex items-center gap-3">
                <!-- 圖標容器 -->
                <div :class="[
                    'flex h-12 w-12 items-center justify-center rounded-full',
                    iconBackgroundClass
                ]">
                    <component :is="iconComponent" class="h-6 w-6" :class="iconColorClass" />
                </div>
                
                <!-- 標題和時間 -->
                <div>
                    <p class="font-medium text-foreground">{{ title }}</p>
                    <p class="text-sm text-muted-foreground">{{ time }}</p>
                </div>
            </div>

            <!-- 金額 -->
            <p class="text-lg font-semibold" :class="amountColorClass">
                {{ amount }}
            </p>
        </CardContent>
    </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { CategoryUtils, type IconKey } from '@/composables/useCategories'

interface Props {
    icon: string
    title: string
    amount: string
    time: string
}

const props = defineProps<Props>()

// 使用 CategoryUtils 取得 icon 元件
const iconComponent = computed(() => {
    return CategoryUtils.getIconByKey(props.icon)
})

// 類別顏色配置
const iconColorConfig: Record<IconKey, { background: string; color: string }> = {
    restaurant: { background: 'bg-category-food-bg', color: 'text-category-food' },
    heart: { background: 'bg-category-pet-bg', color: 'text-category-pet' },
    shopping: { background: 'bg-category-shopping-bg', color: 'text-category-shopping' },
    car: { background: 'bg-category-transport-bg', color: 'text-category-transport' },
    home: { background: 'bg-category-home-bg', color: 'text-category-home' },
    package: { background: 'bg-category-other-bg', color: 'text-category-other' }
}

const iconBackgroundClass = computed(() => {
    const config = iconColorConfig[props.icon as IconKey]
    return config?.background || 'bg-category-other-bg'
})

const iconColorClass = computed(() => {
    const config = iconColorConfig[props.icon as IconKey]
    return config?.color || 'text-category-other'
})

const amountColorClass = computed(() => {
    return props.amount.startsWith('-') ? 'text-expense' : 'text-income'
})
</script>