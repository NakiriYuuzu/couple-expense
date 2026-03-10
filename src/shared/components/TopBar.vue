<template>
    <header class="sticky top-0 z-50 w-full glass">
        <div class="flex items-center justify-between px-4 py-2">
            <!-- 返回按鈕 (可選) -->
            <Button
                v-if="showBackButton"
                variant="ghost"
                size="icon"
                class="h-9 w-9 rounded-full press-feedback hover-transition"
                @click="handleBack"
            >
                <ChevronLeft class="h-6 w-6" />
            </Button>
            <!-- 佔位元素 (當沒有返回按鈕時) -->
            <div v-else class="h-9 w-9" />

            <!-- 標題 -->
            <h1 class="text-lg font-semibold font-heading text-nav-foreground">
                {{ displayTitle }}
            </h1>

            <!-- 右側按鈕或佔位元素 -->
            <slot name="action">
                <div class="h-9 w-9" />
            </slot>
        </div>
    </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/shared/components/ui/button'
import { ChevronLeft } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Props {
    title?: string
    showBackButton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    title: '',
    showBackButton: false
})

const emit = defineEmits<{
    back: []
}>()

const handleBack = () => {
    emit('back')
}

// 如果沒有傳入 title，使用 i18n 的預設值
const displayTitle = computed(() => props.title || t('nav.home'))
</script>