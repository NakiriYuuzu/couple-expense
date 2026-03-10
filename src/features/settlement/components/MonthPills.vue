<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
    months: string[]
    modelValue: string
    currentMonth: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
    'update:modelValue': [month: string]
}>()

const { t } = useI18n()
const scrollContainerRef = ref<HTMLElement | null>(null)

const formatMonth = (yearMonth: string): string => {
    const month = yearMonth.split('-')[1]
    const monthNum = parseInt(month, 10)
    if (yearMonth === props.currentMonth) {
        return t('overview.currentMonth')
    }
    return `${monthNum}月`
}

const formatYear = (yearMonth: string): string => {
    return yearMonth.split('-')[0]
}

const needsYearLabel = (yearMonth: string, index: number): boolean => {
    if (index === 0) return true
    const prevYear = props.months[index - 1]?.split('-')[0]
    return yearMonth.split('-')[0] !== prevYear
}

const selectMonth = (month: string) => {
    emit('update:modelValue', month)
}

const scrollToSelected = async () => {
    await nextTick()
    const container = scrollContainerRef.value
    if (!container) return
    const selected = container.querySelector('[data-selected="true"]') as HTMLElement
    if (selected) {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth'
        selected.scrollIntoView({ behavior, inline: 'center', block: 'nearest' })
    }
}

onMounted(scrollToSelected)
watch(() => props.modelValue, scrollToSelected)
</script>

<template>
    <div
        ref="scrollContainerRef"
        class="flex items-center gap-2 overflow-x-auto px-4 py-2 scrollbar-hide"
    >
        <template v-for="(month, index) in months" :key="month">
            <span
                v-if="needsYearLabel(month, index)"
                class="text-xs text-muted-foreground font-medium shrink-0 pr-1"
            >
                {{ formatYear(month) }}
            </span>

            <button
                class="shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer press-feedback"
                :class="modelValue === month
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'glass text-muted-foreground hover:text-foreground'"
                :data-selected="modelValue === month"
                @click="selectMonth(month)"
            >
                {{ formatMonth(month) }}
            </button>
        </template>
    </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
.scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>
