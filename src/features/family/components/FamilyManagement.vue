<template>
  <div class="family-management p-6 max-w-2xl mx-auto space-y-6">
    <!-- 載入狀態 -->
    <div v-if="familyStore.loading" class="flex items-center justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#9747FF]"></div>
    </div>

    <!-- 錯誤狀態 -->
    <div v-if="familyStore.error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <div class="flex">
        <AlertCircle class="h-5 w-5 text-red-400 mr-2 flex-shrink-0 mt-0.5" />
        <div>
          <h3 class="text-sm font-medium text-red-800">{{ t('family.error') }}</h3>
          <p class="text-sm text-red-700 mt-1">{{ familyStore.error }}</p>
          <Button @click="familyStore.clearError" variant="outline" size="sm" class="mt-2">
            {{ t('family.clearError') }}
          </Button>
        </div>
      </div>
    </div>

    <!-- 尚未加入家庭 -->
    <div v-if="!familyStore.isInFamily" class="space-y-6">
      <div class="text-center">
        <Heart class="h-16 w-16 text-[#9747FF] mx-auto mb-4" />
        <h2 class="text-2xl font-bold text-gray-900 mb-2">{{ t('family.createOrJoin') }}</h2>
        <p class="text-gray-600">{{ t('family.manageSharedExpenses') }}</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- 創建新家庭 -->
        <Card class="p-6">
          <div class="text-center space-y-4">
            <Users class="h-12 w-12 text-[#9747FF] mx-auto" />
            <h3 class="text-lg font-semibold">{{ t('family.createNew') }}</h3>
            <p class="text-sm text-gray-600">{{ t('family.createDesc') }}</p>

            <div class="space-y-3">
              <Input
                v-model="familyName"
                :placeholder="t('family.familyNamePlaceholder')"
                class="w-full"
              />
              <Button @click="handleCreateFamily" :disabled="familyStore.loading" class="w-full">
                <Plus class="h-4 w-4 mr-2" />
                {{ t('family.create') }}
              </Button>
            </div>
          </div>
        </Card>

        <!-- 加入現有家庭 -->
        <Card class="p-6">
          <div class="text-center space-y-4">
            <UserPlus class="h-12 w-12 text-[#9747FF] mx-auto" />
            <h3 class="text-lg font-semibold">{{ t('family.join') }}</h3>
            <p class="text-sm text-gray-600">{{ t('family.joinDesc') }}</p>

            <div class="space-y-3">
              <Input
                v-model="invitationCode"
                :placeholder="t('family.invitationCodePlaceholder')"
                class="w-full"
                maxlength="8"
              />
              <Button @click="handleJoinFamily" :disabled="familyStore.loading || !invitationCode" class="w-full">
                <UserPlus class="h-4 w-4 mr-2" />
                {{ t('family.joinButton') }}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>

    <!-- 已加入家庭 -->
    <div v-else class="space-y-6">
      <!-- 家庭信息 -->
      <Card class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold flex items-center">
            <Heart class="h-6 w-6 text-red-500 mr-2" />
            {{ familyStore.family?.name }}
          </h2>
          <Badge v-if="familyStore.isOwner" variant="secondary">{{ t('family.admin') }}</Badge>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- 邀請碼 -->
          <div class="space-y-2">
            <Label>{{ t('family.invitationCode') }}</Label>
            <div class="flex items-center space-x-2">
              <Input
                :model-value="invitationCodeDisplay"
                readonly
                class="font-mono"
                :placeholder="!invitationCodeDisplay ? t('family.loading') : ''"
              />
              <Button @click="copyInvitationCode" variant="outline" size="sm">
                <Copy class="h-4 w-4" />
              </Button>
            </div>
            <p class="text-xs text-gray-500">{{ t('family.shareCode') }}</p>
          </div>

          <!-- 成員狀態 -->
          <div class="space-y-2">
            <Label>{{ t('family.memberStatus') }}</Label>
            <div v-if="familyStore.hasMembers" class="flex items-center space-x-2">
              <div class="h-2 w-2 bg-green-500 rounded-full"></div>
              <span class="text-sm">{{ familyStore.memberProfiles?.display_name || t('family.joined') }}</span>
            </div>
            <div v-else class="flex items-center space-x-2">
              <div class="h-2 w-2 bg-gray-400 rounded-full"></div>
              <span class="text-sm text-gray-500">{{ t('family.waitingForMember') }}</span>
            </div>
          </div>
        </div>
      </Card>

      <!-- 預算設定 -->
      <Card class="p-6">
        <h3 class="text-lg font-semibold mb-4 flex items-center">
          <DollarSign class="h-5 w-5 mr-2" />
          {{ t('family.budgetSettings') }}
        </h3>

        <div class="space-y-4">
          <!-- 月度預算 -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label>{{ t('family.monthlyBudget') }}</Label>
              <div class="flex items-center space-x-2">
                <Input
                  v-model.number="monthlyBudget"
                  type="number"
                  min="0"
                  step="100"
                  class="flex-1"
                />
                <span class="text-sm text-gray-500">{{ familyStore.familySettings?.currency || 'TWD' }}</span>
              </div>
            </div>

            <div class="space-y-2">
              <Label>{{ t('family.budgetStartDay') }}</Label>
              <Select v-model="budgetStartDay">
                <SelectTrigger>
                  <SelectValue :placeholder="t('family.selectDate')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="day in 28" :key="day" :value="day.toString()">
                    {{ t('family.dayOfMonth', { day }) }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- 類別預算 -->
          <div class="space-y-3">
            <Label>{{ t('family.categoryBudgetAllocation') }}</Label>
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
              {{ t('family.total') }}: {{ Object.values(categoryBudgets).reduce((sum, val) => sum + (val || 0), 0) }} {{ familyStore.familySettings?.currency || 'TWD' }}
            </div>
          </div>

          <!-- 儲存按鈕 -->
          <div class="flex justify-end space-x-2">
            <Button @click="resetBudgetSettings" variant="outline">
              {{ t('family.reset') }}
            </Button>
            <Button @click="saveBudgetSettings" :disabled="familyStore.loading">
              <Save class="h-4 w-4 mr-2" />
              {{ t('family.saveSettings') }}
            </Button>
          </div>
        </div>
      </Card>

      <!-- 危險區域 -->
      <Card class="p-6 border-red-200">
        <h3 class="text-lg font-semibold mb-4 text-red-600 flex items-center">
          <AlertTriangle class="h-5 w-5 mr-2" />
          {{ t('family.dangerZone') }}
        </h3>
        <div class="space-y-4">
          <div class="bg-red-50 p-4 rounded-lg">
            <p class="text-sm text-red-700 mb-3">{{ t('family.leaveWarning') }}</p>
            <ul class="text-xs text-red-600 space-y-1 ml-4">
              <li>• {{ t('family.leaveWarning1') }}</li>
              <li>• {{ t('family.leaveWarning2') }}</li>
              <li>• {{ t('family.leaveWarning3') }}</li>
            </ul>
          </div>
          <Button @click="handleLeaveFamily" variant="destructive" :disabled="familyStore.loading">
            <LogOut class="h-4 w-4 mr-2" />
            {{ t('family.leaveFamily') }}
          </Button>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useFamilyStore, type CategoryBudgets } from '@/features/family/stores/family'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import {
  Heart, Users, UserPlus, Plus, Copy, DollarSign, Save,
  AlertTriangle, LogOut, AlertCircle
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'

const familyStore = useFamilyStore()
const { t } = useI18n()

// 計算屬性：獲取邀請碼
const invitationCodeDisplay = computed(() => {
    const code = familyStore.family?.invitation_code
    return code || ''
})

// 表單數據
const familyName = ref('我們的家庭')
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

// 創建家庭
const handleCreateFamily = async () => {
    try {
        const invitationCode = await familyStore.createFamily(familyName.value)
        toast.success(t('family.createSuccess', { code: invitationCode }))
    } catch (error) {
        toast.error(t('family.createError'))
    }
}

// 加入家庭
const handleJoinFamily = async () => {
    try {
        await familyStore.joinFamilyWithCode(invitationCode.value.trim())
        toast.success(t('family.joinSuccess'))
        invitationCode.value = ''
    } catch (error) {
        toast.error(t('family.joinError'))
    }
}

// 複製邀請碼
const copyInvitationCode = async () => {
    try {
        await navigator.clipboard.writeText(familyStore.family?.invitation_code || '')
        toast.success(t('family.copySuccess'))
    } catch (error) {
        toast.error(t('family.copyError'))
    }
}

// 儲存預算設定
const saveBudgetSettings = async () => {
    try {
        await familyStore.updateFamilySettings({
            monthly_budget: monthlyBudget.value,
            budget_start_day: parseInt(budgetStartDay.value),
            category_budgets: { ...categoryBudgets }
        })
        toast.success(t('family.saveSuccess'))
    } catch (error) {
        toast.error(t('family.saveError'))
    }
}

// 重置預算設定
const resetBudgetSettings = () => {
    const settings = familyStore.familySettings
    if (settings) {
        monthlyBudget.value = settings.monthly_budget
        budgetStartDay.value = settings.budget_start_day.toString()

        const budgets = settings.category_budgets as Record<string, unknown> | null
        if (budgets && typeof budgets === 'object') {
            Object.assign(categoryBudgets, budgets)
        }
    }
}

// 離開家庭
const handleLeaveFamily = async () => {
    if (!confirm(t('family.confirmLeave'))) {
        return
    }

    try {
        await familyStore.leaveFamily()
        toast.success(t('family.leaveSuccess'))
    } catch (error) {
        toast.error(t('family.leaveError'))
    }
}

// 監聽家庭設定變化，同步到表單
watch(() => familyStore.familySettings, (settings) => {
    if (settings) {
        monthlyBudget.value = settings.monthly_budget
        budgetStartDay.value = settings.budget_start_day.toString()

        const budgets = settings.category_budgets as Record<string, unknown> | null
        if (budgets && typeof budgets === 'object') {
            Object.assign(categoryBudgets, budgets)
        }
    }
}, { immediate: true })

// 組件掛載時獲取用戶資料
onMounted(async () => {
    try {
        await familyStore.fetchUserProfile()
    } catch (error) {
        console.error('獲取用戶資料失敗:', error)
    }
})
</script>

<style scoped>
.family-management {
    min-height: 100vh;
}
</style>
