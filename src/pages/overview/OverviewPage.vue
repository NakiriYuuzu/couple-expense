<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TopBar from '@/shared/components/TopBar.vue'
import StatisticsPanel from '@/features/statistics/components/StatisticsPanel.vue'
import DebtPanel from '@/features/settlement/components/DebtPanel.vue'

const { t } = useI18n()

const activePanel = ref<'statistics' | 'debts'>('statistics')

const switchPanel = (panel: 'statistics' | 'debts') => {
    activePanel.value = panel
}
</script>

<template>
    <div class="min-h-screen pb-28 bg-background glass-page-bg">
        <TopBar :title="t('overview.title')" />

        <!-- Panel Indicator -->
        <div class="flex items-center justify-center gap-4 py-3 px-4">
            <button
                class="text-sm font-medium transition-colors duration-150 cursor-pointer"
                :class="activePanel === 'statistics'
                    ? 'text-brand-primary'
                    : 'text-muted-foreground'"
                @click="switchPanel('statistics')"
            >
                {{ t('overview.statistics') }}
            </button>

            <div class="flex items-center gap-1.5">
                <span
                    class="block w-2 h-2 rounded-full transition-all duration-200"
                    :class="activePanel === 'statistics'
                        ? 'bg-brand-primary scale-100'
                        : 'bg-muted-foreground/30 scale-75'"
                />
                <span
                    class="block w-2 h-2 rounded-full transition-all duration-200"
                    :class="activePanel === 'debts'
                        ? 'bg-brand-primary scale-100'
                        : 'bg-muted-foreground/30 scale-75'"
                />
            </div>

            <button
                class="text-sm font-medium transition-colors duration-150 cursor-pointer"
                :class="activePanel === 'debts'
                    ? 'text-brand-primary'
                    : 'text-muted-foreground'"
                @click="switchPanel('debts')"
            >
                {{ t('overview.debts') }}
            </button>
        </div>

        <!-- Panel Container -->
        <div class="overflow-hidden">
            <StatisticsPanel v-if="activePanel === 'statistics'" />
            <DebtPanel v-else />
        </div>
    </div>
</template>
