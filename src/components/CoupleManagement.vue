<template>
  <div class="couple-management p-6 max-w-2xl mx-auto space-y-6">
    <!-- 載入狀態 -->
    <div v-if="coupleStore.loading" class="flex items-center justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#9747FF]"></div>
    </div>

    <!-- 錯誤狀態 -->
    <div v-if="coupleStore.error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <div class="flex">
        <AlertCircle class="h-5 w-5 text-red-400 mr-2 flex-shrink-0 mt-0.5" />
        <div>
          <h3 class="text-sm font-medium text-red-800">{{ t('couple.error') }}</h3>
          <p class="text-sm text-red-700 mt-1">{{ coupleStore.error }}</p>
          <Button @click="coupleStore.clearError" variant="outline" size="sm" class="mt-2">
            {{ t('couple.clearError') }}
          </Button>
        </div>
      </div>
    </div>

    <!-- 尚未加入情侶 -->
    <div v-if="!coupleStore.isInCouple" class="space-y-6">
      <div class="text-center">
        <Heart class="h-16 w-16 text-[#9747FF] mx-auto mb-4" />
        <h2 class="text-2xl font-bold text-gray-900 mb-2">{{ t('couple.createOrJoin') }}</h2>
        <p class="text-gray-600">{{ t('couple.manageSharedExpenses') }}</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- 創建新情侶 -->
        <Card class="p-6">
          <div class="text-center space-y-4">
            <Users class="h-12 w-12 text-[#9747FF] mx-auto" />
            <h3 class="text-lg font-semibold">{{ t('couple.createNew') }}</h3>
            <p class="text-sm text-gray-600">{{ t('couple.createDesc') }}</p>
            
            <div class="space-y-3">
              <Input
                v-model="coupleName"
                :placeholder="t('couple.coupleNamePlaceholder')"
                class="w-full"
              />
              <Button @click="handleCreateCouple" :disabled="coupleStore.loading" class="w-full">
                <Plus class="h-4 w-4 mr-2" />
                {{ t('couple.create') }}
              </Button>
            </div>
          </div>
        </Card>

        <!-- 加入現有情侶 -->
        <Card class="p-6">
          <div class="text-center space-y-4">
            <UserPlus class="h-12 w-12 text-[#9747FF] mx-auto" />
            <h3 class="text-lg font-semibold">{{ t('couple.join') }}</h3>
            <p class="text-sm text-gray-600">{{ t('couple.joinDesc') }}</p>
            
            <div class="space-y-3">
              <Input
                v-model="invitationCode"
                :placeholder="t('couple.invitationCodePlaceholder')"
                class="w-full"
                maxlength="8"
              />
              <Button @click="handleJoinCouple" :disabled="coupleStore.loading || !invitationCode" class="w-full">
                <UserPlus class="h-4 w-4 mr-2" />
                {{ t('couple.joinButton') }}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>

    <!-- 已加入情侶 -->
    <div v-else class="space-y-6">
      <!-- 情侶信息 -->
      <Card class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold flex items-center">
            <Heart class="h-6 w-6 text-red-500 mr-2" />
            {{ coupleStore.couple?.name }}
          </h2>
          <Badge v-if="coupleStore.isOwner" variant="secondary">{{ t('couple.admin') }}</Badge>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- 邀請碼 -->
          <div class="space-y-2">
            <Label>{{ t('couple.invitationCode') }}</Label>
            <div class="flex items-center space-x-2">
              <Input
                :model-value="invitationCodeDisplay"
                readonly
                class="font-mono"
                :placeholder="!invitationCodeDisplay ? t('couple.loading') : ''"
              />
              <Button @click="copyInvitationCode" variant="outline" size="sm">
                <Copy class="h-4 w-4" />
              </Button>
            </div>
            <p class="text-xs text-gray-500">{{ t('couple.shareCode') }}</p>
          </div>

          <!-- 伴侶狀態 -->
          <div class="space-y-2">
            <Label>{{ t('couple.partnerStatus') }}</Label>
            <div v-if="coupleStore.hasPartner" class="flex items-center space-x-2">
              <div class="h-2 w-2 bg-green-500 rounded-full"></div>
              <span class="text-sm">{{ coupleStore.partnerProfile?.display_name || t('couple.joined') }}</span>
            </div>
            <div v-else class="flex items-center space-x-2">
              <div class="h-2 w-2 bg-gray-400 rounded-full"></div>
              <span class="text-sm text-gray-500">{{ t('couple.waitingForPartner') }}</span>
            </div>
          </div>
        </div>
      </Card>

      <!-- 預算設定 -->
      <Card class="p-6">
        <h3 class="text-lg font-semibold mb-4 flex items-center">
          <DollarSign class="h-5 w-5 mr-2" />
          {{ t('couple.budgetSettings') }}
        </h3>

        <div class="space-y-4">
          <!-- 月度預算 -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label>{{ t('couple.monthlyBudget') }}</Label>
              <div class="flex items-center space-x-2">
                <Input
                  v-model.number="monthlyBudget"
                  type="number"
                  min="0"
                  step="100"
                  class="flex-1"
                />
                <span class="text-sm text-gray-500">{{ coupleStore.coupleSettings?.currency || 'TWD' }}</span>
              </div>
            </div>

            <div class="space-y-2">
              <Label>{{ t('couple.budgetStartDay') }}</Label>
              <Select v-model="budgetStartDay">
                <SelectTrigger>
                  <SelectValue :placeholder="t('couple.selectDate')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="day in 28" :key="day" :value="day.toString()">
                    {{ t('couple.dayOfMonth', { day }) }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- 類別預算 -->
          <div class="space-y-3">
            <Label>{{ t('couple.categoryBudgetAllocation') }}</Label>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div v-for="(budget, category) in categoryBudgets" :key="category" class="space-y-1">
                <Label class="text-sm capitalize">{{ getCategoryName(category) }}</Label>
                <Input
                  v-model.number="categoryBudgets[category]"
                  type="number"
                  min="0"
                  step="100"
                  class="text-sm"
                />
              </div>
            </div>
            <div class="text-xs text-gray-500">
              {{ t('couple.total') }}: {{ Object.values(categoryBudgets).reduce((sum, val) => sum + (val || 0), 0) }} {{ coupleStore.coupleSettings?.currency || 'TWD' }}
            </div>
          </div>

          <!-- 儲存按鈕 -->
          <div class="flex justify-end space-x-2">
            <Button @click="resetBudgetSettings" variant="outline">
              {{ t('couple.reset') }}
            </Button>
            <Button @click="saveBudgetSettings" :disabled="coupleStore.loading">
              <Save class="h-4 w-4 mr-2" />
              {{ t('couple.saveSettings') }}
            </Button>
          </div>
        </div>
      </Card>

      <!-- 危險區域 -->
      <Card class="p-6 border-red-200">
        <h3 class="text-lg font-semibold mb-4 text-red-600 flex items-center">
          <AlertTriangle class="h-5 w-5 mr-2" />
          {{ t('couple.dangerZone') }}
        </h3>
        <div class="space-y-4">
          <div class="bg-red-50 p-4 rounded-lg">
            <p class="text-sm text-red-700 mb-3">{{ t('couple.leaveWarning') }}</p>
            <ul class="text-xs text-red-600 space-y-1 ml-4">
              <li>• {{ t('couple.leaveWarning1') }}</li>
              <li>• {{ t('couple.leaveWarning2') }}</li>
              <li>• {{ t('couple.leaveWarning3') }}</li>
            </ul>
          </div>
          <Button @click="handleLeaveCouple" variant="destructive" :disabled="coupleStore.loading">
            <LogOut class="h-4 w-4 mr-2" />
            {{ t('couple.leaveCouple') }}
          </Button>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useCoupleStore, type CategoryBudgets } from '@/stores/couple'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Heart, Users, UserPlus, Plus, Copy, DollarSign, Save, 
  AlertTriangle, LogOut, AlertCircle 
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'

const coupleStore = useCoupleStore()
const { t } = useI18n()

// 計算屬性：獲取邀請碼
const invitationCodeDisplay = computed(() => {
  const code = coupleStore.couple?.invitation_code
  console.log('邀請碼調試:', { 
    couple: coupleStore.couple, 
    invitationCode: code,
    hasCouple: !!coupleStore.couple 
  })
  return code || ''
})

// 表單數據
const coupleName = ref('我們的家庭')
const invitationCode = ref('')
const monthlyBudget = ref(50000)
const budgetStartDay = ref('1')

// 類別預算（響應式對象）
const categoryBudgets = reactive<CategoryBudgets>({
  food: 15000,
  transport: 8000,
  shopping: 10000,
  home: 8000,
  pet: 5000,
  other: 4000
})

// 類別名稱映射
const getCategoryName = (category: string): string => {
  const categoryKey = `expense.categories.${category}`
  return t(categoryKey)
}

// 創建情侶
const handleCreateCouple = async () => {
  try {
    const invitationCode = await coupleStore.createCouple(coupleName.value)
    toast.success(t('couple.createSuccess', { code: invitationCode }))
  } catch (error) {
    toast.error(t('couple.createError'))
  }
}

// 加入情侶
const handleJoinCouple = async () => {
  try {
    await coupleStore.joinCouple(invitationCode.value.trim())
    toast.success(t('couple.joinSuccess'))
    invitationCode.value = ''
  } catch (error) {
    toast.error(t('couple.joinError'))
  }
}

// 複製邀請碼
const copyInvitationCode = async () => {
  try {
    await navigator.clipboard.writeText(coupleStore.couple?.invitation_code || '')
    toast.success(t('couple.copySuccess'))
  } catch (error) {
    toast.error(t('couple.copyError'))
  }
}

// 儲存預算設定
const saveBudgetSettings = async () => {
  try {
    await coupleStore.updateCoupleSettings({
      monthly_budget: monthlyBudget.value,
      budget_start_day: parseInt(budgetStartDay.value),
      category_budgets: { ...categoryBudgets }
    })
    toast.success(t('couple.saveSuccess'))
  } catch (error) {
    toast.error(t('couple.saveError'))
  }
}

// 重置預算設定
const resetBudgetSettings = () => {
  const settings = coupleStore.coupleSettings
  if (settings) {
    monthlyBudget.value = settings.monthly_budget
    budgetStartDay.value = settings.budget_start_day.toString()
    
    // 使用 any 類型來避免 TypeScript 深度實例化問題
    const settingsAny: any = settings
    const budgets = settingsAny.category_budgets
    if (budgets && typeof budgets === 'object') {
      Object.assign(categoryBudgets, budgets)
    }
  }
}

// 離開情侶
const handleLeaveCouple = async () => {
  if (!confirm(t('couple.confirmLeave'))) {
    return
  }
  
  try {
    await coupleStore.leaveCouple()
    toast.success(t('couple.leaveSuccess'))
  } catch (error) {
    toast.error(t('couple.leaveError'))
  }
}

// 監聽 couple 設定變化，同步到表單
watch(() => coupleStore.coupleSettings, (settings) => {
  if (settings) {
    monthlyBudget.value = settings.monthly_budget
    budgetStartDay.value = settings.budget_start_day.toString()
    
    // 使用 any 類型來避免 TypeScript 深度實例化問題
    const settingsAny: any = settings
    const budgets = settingsAny.category_budgets
    if (budgets && typeof budgets === 'object') {
      Object.assign(categoryBudgets, budgets)
    }
  }
}, { immediate: true })

// 組件掛載時獲取用戶資料
onMounted(async () => {
  try {
    await coupleStore.fetchUserProfile()
  } catch (error) {
    console.error('獲取用戶資料失敗:', error)
  }
})
</script>

<style scoped>
.couple-management {
  min-height: 100vh;
}
</style>