<template>
    <div class="glass rounded-2xl p-4 hover-transition">
        <!-- 日期標題 -->
        <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
                <Calendar class="h-4 w-4 text-muted-foreground" />
                <h3 class="text-sm font-normal text-foreground">
                    {{ date }}
                </h3>
            </div>

            <div class="flex items-center gap-2">
                <!-- 每日總計 -->
                <span class="text-sm font-semibold text-expense">
                    NT {{ dailyTotal.toLocaleString() }}
                </span>

                <!-- 下拉選單 -->
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            class="h-6 w-6 rounded-full hover:bg-accent"
                        >
                            <MoreHorizontal class="h-4 w-4 text-foreground" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" class="w-40">
                        <DropdownMenuItem
                            @click="handleDeleteAll"
                            class="text-destructive focus:text-destructive hover:text-destructive cursor-pointer"
                        >
                            <Trash2 class="mr-2 h-4 w-4" />
                            {{ t('expense.deleteAll') }}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>

        <!-- 費用列表 -->
        <div class="space-y-2">
            <ExpenseItem
                v-for="expense in expenses"
                :key="expense.id"
                :id="expense.id"
                :title="expense.title"
                :amount="expense.amount"
                :category="expense.category"
                :icon="expense.icon"
                :user="expense.user"
                :show-user="showUser"
                :group-name="expense.groupName"
                :split-method="expense.splitMethod"
                :is-settled="expense.isSettled"
                @click="handleExpenseClick"
            />
        </div>
    </div>

    <!-- 確認刪除對話框 -->
    <Dialog v-model:open="showDeleteDialog">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t('expense.confirmDeleteTitle') }}</DialogTitle>
                <DialogDescription>
                    {{ t('expense.confirmDeleteDateDesc', { date }) }}
                </DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button variant="outline" @click="showDeleteDialog = false">
                    {{ t('common.cancel') }}
                </Button>
                <Button variant="destructive" @click="confirmDeleteAll" :disabled="loading">
                    {{ loading ? t('expense.deleting') : t('expense.confirmDeleteBtn') }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { Calendar, MoreHorizontal, Trash2 } from 'lucide-vue-next'
import { useExpenseStore } from '@/shared/stores'
import { toast } from 'vue-sonner'
import ExpenseItem from '@/features/expense/components/ExpenseItem.vue'
import type { DisplayExpense } from '@/entities/expense/types'

const { t } = useI18n()

interface Props {
    date: string
    expenses: DisplayExpense[]
    showUser?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
    'expense-click': [expense: DisplayExpense]
}>()

const expenseStore = useExpenseStore()
const { loading } = expenseStore

// 每日總計：優先使用 numericAmount，避免 regex 解析字串
const dailyTotal = computed(() =>
    props.expenses.reduce((sum, e) => sum + (e.numericAmount ?? 0), 0)
)

// 確認刪除對話框狀態
const showDeleteDialog = ref(false)

const handleExpenseClick = (expenseProps: { id?: string; title: string; amount: string; category: string; icon: string }) => {
    // 找到對應的 DisplayExpense（含 split 資訊）
    const found = props.expenses.find(e => e.id === expenseProps.id)
    if (found) {
        emit('expense-click', found)
    }
}

// 處理全部刪除按鈕點擊
const handleDeleteAll = () => {
    showDeleteDialog.value = true
}

// 確認刪除所有費用
const confirmDeleteAll = async () => {
    try {
        // 轉換日期格式從 "2025/08/03" 到 "2025-08-03"
        const storeDate = props.date.replace(/\//g, '-')

        await expenseStore.deleteExpensesByDate(storeDate)

        showDeleteDialog.value = false
        toast.success(t('expense.deleteAllSuccess'))
    } catch (error) {
        console.error('刪除費用失敗:', error)
        toast.error(t('expense.deleteAllFailed'))
    }
}
</script>

<style scoped>
</style>
