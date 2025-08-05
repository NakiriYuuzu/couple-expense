<template>
    <div class="min-h-screen bg-background">
        <!-- 頂部導航欄 -->
        <TopBar :title="t('stats.title')"/>

        <!-- 主要內容區域 -->
        <main class="px-4 pb-24">
            <!-- Tabs 容器 -->
            <div class="mt-6">
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
                        <CalendarView/>
                    </TabsContent>

                    <!-- Chart View Tab -->
                    <TabsContent value="chart" class="mt-6">
                        <ChartView/>
                    </TabsContent>
                </Tabs>
            </div>
        </main>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TopBar from '@/components/TopBar.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CalendarView from '@/components/CalendarView.vue'
import ChartView from '@/components/ChartView.vue'
import { useExpenseStore, useCoupleStore } from '@/stores'
import { toast } from 'vue-sonner'
import { usePullToRefresh } from '@/composables/usePullToRefresh'

const { t } = useI18n()
const expenseStore = useExpenseStore()
const coupleStore = useCoupleStore()

// 使用下拉刷新
usePullToRefresh({
    onRefresh: async () => {
        try {
            await Promise.all([
                expenseStore.fetchExpenses(),
                coupleStore.fetchUserProfile()
            ])
            toast.success('資料已更新')
        } catch (error) {
            console.error('刷新失敗:', error)
            toast.error('刷新失敗，請稍後重試')
        }
    }
})
</script>
