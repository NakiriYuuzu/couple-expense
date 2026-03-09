<template>
    <div class="min-h-screen bg-background">
        <!-- 頂部導航欄 -->
        <TopBar :title="t('stats.title')"/>

        <!-- 主要內容區域 -->
        <main class="px-4 pb-24">
            <!-- 個人/家庭 Tab 切換 -->
            <div class="mt-6">
                <Tabs v-model="expenseScope" class="w-full">
                    <TabsList class="grid w-full grid-cols-2">
                        <TabsTrigger value="personal" class="flex items-center gap-2">
                            <User class="h-4 w-4" />
                            {{ t('stats.personalStats') }}
                        </TabsTrigger>
                        <TabsTrigger
                            value="family"
                            :disabled="!isInFamily"
                            class="flex items-center gap-2"
                            :class="{ 'opacity-50 cursor-not-allowed': !isInFamily }"
                        >
                            <Home class="h-4 w-4" />
                            {{ t('stats.familyStats') }}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <!-- 日曆/圖表 Tabs 容器 -->
            <div class="mt-4">
                <Tabs default-value="calendar" class="w-full">
                    <TabsList class="grid w-full grid-cols-2">
                        <TabsTrigger value="calendar">
                            {{ t('stats.calendarView') }}
                        </TabsTrigger>
                        <TabsTrigger value="chart">
                            {{ t('stats.chartAnalysis') }}
                        </TabsTrigger>
                    </TabsList>

                    <!-- Calendar View Tab -->
                    <TabsContent value="calendar" class="mt-6">
                        <CalendarView :scope="expenseScope" />
                    </TabsContent>

                    <!-- Chart View Tab -->
                    <TabsContent value="chart" class="mt-6">
                        <ChartView :scope="expenseScope" />
                    </TabsContent>
                </Tabs>
            </div>
        </main>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import TopBar from '@/shared/components/TopBar.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import CalendarView from '@/features/statistics/components/CalendarView.vue'
import ChartView from '@/features/statistics/components/ChartView.vue'
import { useExpenseStore, useFamilyStore } from '@/shared/stores'
import { toast } from 'vue-sonner'
import { usePullToRefresh } from '@/shared/composables/usePullToRefresh'
import { User, Home } from 'lucide-vue-next'

const { t } = useI18n()
const expenseStore = useExpenseStore()
const familyStore = useFamilyStore()

const { isInFamily } = storeToRefs(familyStore)

// 統計範圍選擇
const expenseScope = ref<'personal' | 'family'>('personal')

// 使用下拉刷新
usePullToRefresh({
    onRefresh: async () => {
        try {
            await Promise.all([
                expenseStore.fetchExpenses(),
                familyStore.fetchUserProfile()
            ])
            toast.success('資料已更新')
        } catch (error) {
            console.error('刷新失敗:', error)
            toast.error('刷新失敗，請稍後重試')
        }
    }
})
</script>
