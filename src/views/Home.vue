<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { parseDate, type DateValue } from '@internationalized/date'
import TopBar from '@/components/TopBar.vue'
import ExpenseGroup from '@/components/ExpenseGroup.vue'
import { useExpenseStore, useCoupleStore } from '@/stores'
import { toast } from 'vue-sonner'
import { 
    Utensils,
    ShoppingBag,
    Bus,
    Cat,
    Home,
    Package,
    Calendar as CalendarIcon,
    Lock
} from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const expenseStore = useExpenseStore()
const coupleStore = useCoupleStore()
const { expenses } = storeToRefs(expenseStore)
const { isInCouple, coupleSettings } = storeToRefs(coupleStore)

// Balance 相關狀態
const personalBalance = ref(2000) // 個人預算
const isBalanceDialogOpen = ref(false)
const newBalanceInput = ref('')

// 計算當前使用的預算額度（有情侶設定時使用情侶預算）
const currentBalance = computed(() => {
    if (isInCouple.value && coupleSettings.value?.monthly_budget) {
        return coupleSettings.value.monthly_budget
    }
    return personalBalance.value
})

// 判斷是否使用情侶預算
const isUsingCoupleBudget = computed(() => {
    return isInCouple.value && coupleSettings.value?.monthly_budget
})

// Balance 相關處理器
const handleBalanceClick = () => {
    // 如果是情侶預算，顯示提示並導向情侶設定
    if (isUsingCoupleBudget.value) {
        toast.info('請前往情侶設定調整預算', {
            action: {
                label: '前往設定',
                onClick: () => router.push('/settings')
            }
        })
        return
    }
    
    newBalanceInput.value = personalBalance.value.toString()
    isBalanceDialogOpen.value = true
}

const handleBalanceUpdate = () => {
    const newBalance = parseFloat(newBalanceInput.value)
    if (!isNaN(newBalance) && newBalance >= 0) {
        personalBalance.value = newBalance
        isBalanceDialogOpen.value = false
        newBalanceInput.value = ''
    }
}

const cancelBalanceUpdate = () => {
    isBalanceDialogOpen.value = false
    newBalanceInput.value = ''
}

// 編輯 Dialog 狀態
const isEditDialogOpen = ref(false)
const editingExpense = ref<any>(null)

// 類別選項
const categories = computed(() => [
    { id: 'food', label: t('expense.categories.food'), icon: Utensils },
    { id: 'pet', label: t('expense.categories.pet'), icon: Cat },
    { id: 'shopping', label: t('expense.categories.shopping'), icon: ShoppingBag },
    { id: 'transport', label: t('expense.categories.transport'), icon: Bus },
    { id: 'home', label: t('expense.categories.home'), icon: Home },
    { id: 'other', label: t('expense.categories.other'), icon: Package }
])

// 編輯表單數據
const editForm = ref({
    title: '',
    amount: 0,
    category: 'food' as 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other',
    date: ''
})

// 日期選擇器的值
const editDateValue = ref<DateValue>()

// 轉換 store 資料格式為組件需要的格式
const convertStoreExpense = (storeExpense: any) => {
    return {
        id: storeExpense.id,
        title: storeExpense.title,
        amount: `NT ${Math.round(storeExpense.amount)}`, // store 中已經是數字類型
        category: storeExpense.category,
        icon: storeExpense.icon,
        user: storeExpense.user // 加入消費者資訊
    }
}

// 計算總花費（本月）
const totalSpent = computed(() => {
    const currentMonth = new Date().toISOString().substring(0, 7) // "2025-08"
    const monthlyExpenses = expenses.value.filter(expense => expense.date.startsWith(currentMonth))
    return monthlyExpenses.reduce((sum, expense) => {
        return sum + expense.amount // expense.amount 現在是數字類型
    }, 0)
})

// 計算剩餘餘額（餘額 - 本月總花費）
const remainingBalance = computed(() => {
    return currentBalance.value - totalSpent.value
})

// 檢查是否餘額不足
const isBalanceInsufficient = computed(() => {
    return remainingBalance.value < 0
})

// 最近費用分組（僅顯示最近3天）
const recentExpenseGroups = computed(() => {
    const groups: Record<string, any[]> = {}
    
    // 按日期排序並取最近的費用
    const sortedExpenses = [...expenses.value].sort((a, b) => b.date.localeCompare(a.date))
    const recentExpenses = sortedExpenses.slice(0, 15) // 取前15筆作為最近記錄
    
    recentExpenses.forEach(expense => {
        // 日期格式已經是 "2025-05-20"，轉換為顯示格式 "2025/05/20"
        const displayDate = expense.date.replace(/-/g, '/')
        
        if (!groups[displayDate]) {
            groups[displayDate] = []
        }
        groups[displayDate].push(convertStoreExpense(expense))
    })

    return Object.entries(groups)
        .map(([date, expenses]) => ({ date, expenses }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3) // 只顯示最近3天
})

// 處理費用項目點擊
const handleExpenseClick = (expense: any) => {
    // 找到原始資料
    const originalExpense = expenses.value.find(e => e.id === expense.id)
    if (originalExpense) {
        editForm.value = {
            title: originalExpense.title,
            amount: originalExpense.amount, // 已經是數字類型
            category: originalExpense.category,
            date: originalExpense.date.replace(/-/g, '/') // 轉換為顯示格式
        }
        // 設置日期選擇器的值
        const dateParts = originalExpense.date.split('-')
        editDateValue.value = parseDate(`${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`)
        editingExpense.value = originalExpense
        isEditDialogOpen.value = true
    }
}

// 處理日期選擇
const handleEditDateSelect = (date: DateValue | undefined) => {
    if (date) {
        editForm.value.date = `${date.year}/${String(date.month).padStart(2, '0')}/${String(date.day).padStart(2, '0')}`
    }
}

// 格式化日期顯示
const formatEditDate = (dateStr: string) => {
    if (!dateStr) return t('home.selectDate')
    return dateStr
}

// 儲存編輯
const saveEditExpense = async () => {
    if (editingExpense.value) {
        try {
            // 轉換日期格式從 "2025/08/03" 到 "2025-08-03"
            const storeDate = editForm.value.date.replace(/\//g, '-')
            
            await expenseStore.updateExpense(editingExpense.value.id, {
                title: editForm.value.title,
                amount: Math.round(editForm.value.amount), // 數字類型
                category: editForm.value.category,
                date: storeDate
            })
            
            isEditDialogOpen.value = false
            editingExpense.value = null
        } catch (error) {
            console.error('更新費用失敗:', error)
        }
    }
}

// 取消編輯
const cancelEditExpense = () => {
    isEditDialogOpen.value = false
    editingExpense.value = null
}

// 不需要在這裡載入資料，已在 App.vue 中統一處理
</script>

<template>
    <div class="min-h-screen bg-background">
        <!-- 頂部導航欄 -->
        <TopBar />

        <!-- 主要內容區域 -->
        <main class="px-4 pb-20">
            <!-- 餘額卡片區域 -->
            <div class="mt-6 grid gap-4 sm:grid-cols-2">
                <!-- 剩餘餘額卡片 -->
                <Card 
                    class="relative overflow-hidden border-0 shadow-lg animate-slide-in-left hover:shadow-xl transition-all duration-300"
                    :class="isUsingCoupleBudget ? 'cursor-not-allowed' : 'cursor-pointer'"
                    @click="handleBalanceClick"
                >
                    <div 
                        class="absolute inset-0 bg-gradient-to-br transition-all duration-300"
                        :class="isBalanceInsufficient 
                            ? 'from-red-500 to-red-600' 
                            : 'from-brand-primary to-brand-primary/80'"
                    />
                    <CardContent class="relative p-4 sm:p-6">
                        <div class="flex items-center justify-between">
                            <p class="text-sm font-medium text-white/80">
                                {{ isBalanceInsufficient ? t('home.insufficientBalance') : t('home.remainingBalance') }}
                            </p>
                            <div class="flex items-center gap-2">
                                <div 
                                    v-if="isUsingCoupleBudget" 
                                    class="bg-white/20 rounded-full p-1"
                                    :title="'使用情侶預算設定'"
                                >
                                    <Lock class="w-4 h-4 text-white" />
                                </div>
                                <div 
                                    v-if="isBalanceInsufficient" 
                                    class="bg-white/20 rounded-full p-1"
                                    :title="t('home.budgetExceeded')"
                                >
                                    <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <p class="mt-2 text-2xl sm:text-3xl font-bold text-white">
                            <span :class="isBalanceInsufficient ? 'text-white' : ''">
                                {{ isBalanceInsufficient ? '-' : '' }}${{ Math.round(Math.abs(remainingBalance)) }}
                            </span>
                        </p>
                        <p class="mt-1 text-xs text-white/60">
                            {{ isUsingCoupleBudget ? '使用情侶預算設定' : t('home.remainingBalanceDesc') }}
                        </p>
                    </CardContent>
                </Card>

                <!-- 總花費卡片 -->
                <Card class="relative overflow-hidden border-0 shadow-lg animate-slide-in-right hover:shadow-xl transition-all duration-300 cursor-pointer">
                    <div class="absolute inset-0 bg-gradient-to-br from-brand-primary/60 to-brand-primary" />
                    <CardContent class="relative p-4 sm:p-6">
                        <p class="text-sm font-medium text-white/80">{{ t('home.totalSpent') }}</p>
                        <p class="mt-2 text-2xl sm:text-3xl font-bold text-white">NT ${{ Math.round(totalSpent) }}</p>
                    </CardContent>
                </Card>
            </div>

            <!-- 最近消費區域 -->
            <div class="mt-8 animate-fade-in-up">
                <h2 class="mb-4 text-lg font-semibold text-foreground">{{ t('home.recentSpending') }}</h2>

                <!-- 消費記錄列表 -->
                <div class="space-y-4">
                    <ExpenseGroup
                        v-for="group in recentExpenseGroups"
                        :key="group.date"
                        :date="group.date"
                        :expenses="group.expenses"
                        :show-user="isInCouple"
                        @expense-click="handleExpenseClick"
                    />
                </div>
            </div>
        </main>

        <!-- 設定餘額 Dialog -->
        <Dialog v-model:open="isBalanceDialogOpen">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('home.setBalance') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('home.setBalanceDesc') }} ${{ Math.round(currentBalance) }}
                    </DialogDescription>
                </DialogHeader>
                
                <!-- 當前餘額信息 -->
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                    <div class="flex justify-between text-sm">
                        <span class="text-muted-foreground">{{ t('home.balance') }}:</span>
                        <span class="font-medium">${{ Math.round(currentBalance) }}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-muted-foreground">{{ t('home.totalSpent') }}:</span>
                        <span class="font-medium text-red-600">-${{ Math.round(totalSpent) }}</span>
                    </div>
                    <hr class="border-gray-200 dark:border-gray-700">
                    <div class="flex justify-between text-sm font-semibold">
                        <span>{{ t('home.remainingBalance') }}:</span>
                        <span :class="isBalanceInsufficient ? 'text-red-600' : 'text-green-600'">
                            ${{ Math.round(remainingBalance) }}
                        </span>
                    </div>
                </div>
                
                <div class="grid gap-4 py-4">
                    <div class="grid grid-cols-4 items-center gap-4">
                        <label for="balance" class="text-right text-sm font-medium">
                            {{ t('home.amount') }}
                        </label>
                        <Input
                            id="balance"
                            v-model="newBalanceInput"
                            type="number"
                            step="1"
                            min="0"
                            :placeholder="t('home.enterNewBalance')"
                            class="col-span-3"
                            @keyup.enter="handleBalanceUpdate"
                        />
                    </div>
                </div>
                
                <DialogFooter>
                    <Button type="button" variant="outline" @click="cancelBalanceUpdate">
                        {{ t('common.cancel') }}
                    </Button>
                    <Button type="button" @click="handleBalanceUpdate">
                        {{ t('common.confirm') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>


        <!-- 編輯費用 Dialog -->
        <Dialog v-model:open="isEditDialogOpen">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('home.editExpense') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('home.editExpenseDesc') }}
                    </DialogDescription>
                </DialogHeader>

                <div class="grid gap-4 py-4">
                    <!-- 標題 -->
                    <div class="space-y-2">
                        <Label for="edit-title">{{ t('home.title_') }}</Label>
                        <Input
                            id="edit-title"
                            v-model="editForm.title"
                            :placeholder="t('home.enterExpenseTitle')"
                        />
                    </div>

                    <!-- 金額 -->
                    <div class="space-y-2">
                        <Label for="edit-amount">{{ t('home.amount') }}</Label>
                        <Input
                            id="edit-amount"
                            v-model="editForm.amount"
                            type="number"
                            min="0"
                            step="1"
                            :placeholder="t('home.enterAmount')"
                        />
                    </div>

                    <!-- 類別選擇 -->
                    <div class="space-y-2">
                        <Label>{{ t('home.category') }}</Label>
                        <div class="grid grid-cols-3 gap-2">
                            <div
                                v-for="category in categories"
                                :key="category.id"
                                @click="editForm.category = category.id as 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'"
                                :class="[
                                    'flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all',
                                    editForm.category === category.id
                                        ? 'border-brand-primary bg-brand-accent'
                                        : 'border-border hover:border-brand-primary'
                                ]"
                            >
                                <component :is="category.icon" class="h-6 w-6 mb-1" :class="[
                                    editForm.category === category.id
                                        ? 'text-brand-primary'
                                        : 'text-muted-foreground'
                                ]" />
                                <span class="text-xs" :class="[
                                    editForm.category === category.id
                                        ? 'text-brand-primary font-medium'
                                        : 'text-muted-foreground'
                                ]">{{ category.label }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- 日期 -->
                    <div class="space-y-2">
                        <Label>{{ t('home.date') }}</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    class="w-full justify-start text-left font-normal"
                                >
                                    <CalendarIcon class="mr-2 h-4 w-4" />
                                    {{ formatEditDate(editForm.date) }}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent class="w-auto p-0" align="start">
                                <Calendar v-model="editDateValue" @update:model-value="handleEditDateSelect" />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" @click="cancelEditExpense">
                        {{ t('common.cancel') }}
                    </Button>
                    <Button @click="saveEditExpense">
                        {{ t('common.save') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>

<style scoped>
/* 動畫定義 */
@keyframes slide-in-left {
    from {
        transform: translateX(-50px);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slide-in-right {
    from {
        transform: translateX(50px);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes fade-in-up {
    from {
        transform: translateY(30px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

/* 動畫類別 */
.animate-slide-in-left {
    animation: slide-in-left 0.5s ease-out forwards;
}

.animate-slide-in-right {
    animation: slide-in-right 0.5s ease-out 0.1s forwards;
    opacity: 0;
}

.animate-fade-in-up {
    animation: fade-in-up 0.6s ease-out 0.3s forwards;
    opacity: 0;
}
</style>
