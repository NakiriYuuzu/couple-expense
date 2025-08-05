<template>
  <div class="space-y-6">
    <!-- 通知權限狀態 -->
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">推播通知設定</h3>
      
      <!-- 權限狀態卡片 -->
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <p class="font-medium">通知權限</p>
              <p class="text-sm text-muted-foreground">
                {{ permissionStatusText }}
              </p>
            </div>
            
            <div class="flex items-center space-x-2">
              <Badge :variant="permissionBadgeVariant">
                {{ permissionBadgeText }}
              </Badge>
              
              <Button
                v-if="notificationStore.canRequestPermission"
                @click="requestPermission"
                :loading="notificationStore.isLoading"
                size="sm"
              >
                啟用通知
              </Button>
              
              <Button
                v-else-if="notificationStore.hasPermission"
                @click="testNotification"
                variant="outline"
                size="sm"
              >
                測試通知
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 通知設定選項 -->
    <div v-if="notificationStore.hasPermission" class="space-y-4">
      <h4 class="font-medium">通知類型</h4>
      
      <div class="space-y-4">
        <!-- 總開關 -->
        <div class="flex items-center justify-between">
          <div class="space-y-1">
            <Label class="font-medium">啟用推播通知</Label>
            <p class="text-sm text-muted-foreground">
              接收所有推播通知
            </p>
          </div>
          <Switch
            v-model:checked="localSettings.enabled"
            @update:checked="updateSetting('enabled', $event)"
          />
        </div>

        <Separator />

        <!-- 各項通知設定 -->
        <div class="space-y-4" :class="{ 'opacity-50': !localSettings.enabled }">
          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <Label class="font-medium">支出提醒</Label>
              <p class="text-sm text-muted-foreground">
                重要支出和預算提醒
              </p>
            </div>
            <Switch
              v-model:checked="localSettings.expenseReminders"
              @update:checked="updateSetting('expenseReminders', $event)"
              :disabled="!localSettings.enabled"
            />
          </div>

          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <Label class="font-medium">每日總結</Label>
              <p class="text-sm text-muted-foreground">
                每日支出總結報告
              </p>
            </div>
            <Switch
              v-model:checked="localSettings.dailySummary"
              @update:checked="updateSetting('dailySummary', $event)"
              :disabled="!localSettings.enabled"
            />
          </div>

          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <Label class="font-medium">週報</Label>
              <p class="text-sm text-muted-foreground">
                每週支出分析報告
              </p>
            </div>
            <Switch
              v-model:checked="localSettings.weeklyReport"
              @update:checked="updateSetting('weeklyReport', $event)"
              :disabled="!localSettings.enabled"
            />
          </div>

          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <Label class="font-medium">預算警告</Label>
              <p class="text-sm text-muted-foreground">
                預算超支提醒
              </p>
            </div>
            <Switch
              v-model:checked="localSettings.budgetAlerts"
              @update:checked="updateSetting('budgetAlerts', $event)"
              :disabled="!localSettings.enabled"
            />
          </div>

          <Separator />

          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <Label class="font-medium">聲音提醒</Label>
              <p class="text-sm text-muted-foreground">
                通知時播放聲音
              </p>
            </div>
            <Switch
              v-model:checked="localSettings.soundEnabled"
              @update:checked="updateSetting('soundEnabled', $event)"
              :disabled="!localSettings.enabled"
            />
          </div>

          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <Label class="font-medium">震動提醒</Label>
              <p class="text-sm text-muted-foreground">
                通知時震動（限手機）
              </p>
            </div>
            <Switch
              v-model:checked="localSettings.vibrationEnabled"
              @update:checked="updateSetting('vibrationEnabled', $event)"
              :disabled="!localSettings.enabled"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 通知歷史 -->
    <div v-if="notificationStore.hasPermission && notificationStore.history.length > 0" class="space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="font-medium">通知歷史</h4>
        <div class="space-x-2">
          <Button
            v-if="notificationStore.unreadCount > 0"
            @click="notificationStore.markAllAsRead"
            variant="outline"
            size="sm"
          >
            全部標為已讀
          </Button>
          <Button
            @click="notificationStore.clearHistory"
            variant="outline"
            size="sm"
          >
            清除歷史
          </Button>
        </div>
      </div>

      <Card>
        <CardContent class="p-0">
          <div class="max-h-60 overflow-y-auto">
            <div
              v-for="notification in notificationStore.history.slice(0, 10)"
              :key="notification.id"
              class="flex items-start p-4 border-b last:border-b-0"
              :class="{ 'bg-muted/30': !notification.read }"
            >
              <div class="flex-1 space-y-1">
                <div class="flex items-center space-x-2">
                  <p class="font-medium text-sm">{{ notification.title }}</p>
                  <Badge v-if="!notification.read" variant="secondary" class="text-xs">
                    新
                  </Badge>
                </div>
                <p class="text-sm text-muted-foreground">{{ notification.body }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ formatTime(notification.timestamp) }}
                </p>
              </div>
              <Button
                @click="notificationStore.deleteNotification(notification.id)"
                variant="ghost"
                size="sm"
                class="text-muted-foreground hover:text-destructive"
              >
                <X class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 不支援提示 -->
    <Alert v-if="!notificationStore.isSupported" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertTitle>不支援推播通知</AlertTitle>
      <AlertDescription>
        您的瀏覽器或裝置不支援推播通知功能。請使用支援的瀏覽器或更新到最新版本。
      </AlertDescription>
    </Alert>

    <!-- 被封鎖提示 -->
    <Alert v-else-if="notificationStore.isBlocked" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertTitle>通知權限被封鎖</AlertTitle>
      <AlertDescription>
        推播通知權限已被封鎖。請到瀏覽器設定中手動開啟此網站的通知權限。
      </AlertDescription>
    </Alert>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useNotificationStore, type NotificationSettings } from '@/stores/notification'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const notificationStore = useNotificationStore()

// 本地設定副本，避免直接修改 store
const localSettings = ref<NotificationSettings>({ ...notificationStore.settings })

// 計算屬性
const permissionStatusText = computed(() => {
  switch (notificationStore.permissionStatus) {
    case 'granted':
      return '已授權推播通知權限'
    case 'denied':
      return '推播通知權限被拒絕'
    case 'default':
      return '尚未授權推播通知權限'
    default:
      return '未知權限狀態'
  }
})

const permissionBadgeVariant = computed(() => {
  switch (notificationStore.permissionStatus) {
    case 'granted':
      return 'default'
    case 'denied':
      return 'destructive'
    case 'default':
      return 'secondary'
    default:
      return 'outline'
  }
})

const permissionBadgeText = computed(() => {
  switch (notificationStore.permissionStatus) {
    case 'granted':
      return '已授權'
    case 'denied':
      return '被拒絕'
    case 'default':
      return '未授權'
    default:
      return '未知'
  }
})

// 方法
const requestPermission = async () => {
  const success = await notificationStore.requestPermission()
  if (success) {
    // 設定每日和週報通知排程
    try {
      notificationStore.setupDailyNotifications()
      notificationStore.setupWeeklyNotifications()
      toast.success('推播通知已啟用！每日總結和週報已設定完成。')
    } catch (error) {
      console.error('設定通知排程失敗:', error)
      toast.success('推播通知已啟用！')
    }
  }
}

const testNotification = async () => {
  await notificationStore.testNotification()
  toast.success('測試通知已發送！')
}

const updateSetting = async (key: keyof NotificationSettings, value: boolean) => {
  await notificationStore.updateSettings({ [key]: value })
  localSettings.value[key] = value
}

const formatTime = (timestamp: Date) => {
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

// 生命週期
onMounted(async () => {
  await notificationStore.initialize()
  
  // 如果通知權限已授權，確保排程已設定
  if (notificationStore.hasPermission) {
    try {
      notificationStore.setupDailyNotifications()
      notificationStore.setupWeeklyNotifications()
      console.log('通知排程已設定')
      
      // 設定定期 token 驗證（每小時檢查一次）
      setInterval(async () => {
        const isValid = await notificationStore.validateAndUpdateToken()
        if (!isValid) {
          console.log('FCM token 已失效，已自動清理')
          // 可以選擇顯示 toast 通知用戶重新啟用
          // toast.warning('推播通知已失效，請重新啟用')
        }
      }, 60 * 60 * 1000) // 每小時檢查一次
      
    } catch (error) {
      console.error('設定通知排程失敗:', error)
    }
  }
  
  // 同步設定
  localSettings.value = { ...notificationStore.settings }
})
</script>