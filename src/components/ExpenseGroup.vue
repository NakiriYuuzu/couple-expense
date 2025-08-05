<template>
    <div class="bg-background rounded-[20px] p-4 shadow-sm hover:shadow-md transition-all duration-300">
        <!-- 日期標題 -->
        <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
                <h3 class="text-sm font-normal text-foreground">
                    {{ date }}
                </h3>
            </div>
            
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
                        全部刪除
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
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
                @click="handleExpenseClick"
            />
        </div>
    </div>

    <!-- 確認刪除對話框 -->
    <Dialog v-model:open="showDeleteDialog">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>確認刪除</DialogTitle>
                <DialogDescription>
                    確定要刪除 {{ date }} 的所有費用記錄嗎？此操作無法撤銷。
                </DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button variant="outline" @click="showDeleteDialog = false">
                    取消
                </Button>
                <Button variant="destructive" @click="confirmDeleteAll" :disabled="loading">
                    {{ loading ? '刪除中...' : '確認刪除' }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Trash2 } from 'lucide-vue-next'
import { useExpenseStore } from '@/stores'
import { toast } from 'vue-sonner'
import ExpenseItem from '@/components/ExpenseItem.vue'

interface Expense {
    id: string
    title: string
    amount: string
    category: string
    icon: string
    user?: {
        id: string
        display_name: string | null
        avatar_url: string | null
    }
}

interface Props {
    date: string
    expenses: Expense[]
    showUser?: boolean  // 是否顯示使用者資訊
}

const props = defineProps<Props>()

const emit = defineEmits<{
    'expense-click': [expense: Expense]
}>()

const expenseStore = useExpenseStore()
const { loading } = expenseStore

// 確認刪除對話框狀態
const showDeleteDialog = ref(false)

const handleExpenseClick = (expense: any) => {
    emit('expense-click', expense)
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
        toast.success('已成功刪除該日期的所有費用記錄')
    } catch (error) {
        console.error('刪除費用失敗:', error)
        toast.error('刪除失敗，請稍後再試')
    }
}
</script>

<style scoped>
</style>