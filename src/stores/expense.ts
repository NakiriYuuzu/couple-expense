import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useCoupleStore } from './couple'
import { useNotificationStore } from './notification'
import type { ExpenseRow, ExpenseInsert, ExpenseUpdate } from '@/lib/database.types'

export interface Expense {
  id: string  // UUID 類型
  user_id: string
  title: string
  amount: number // 改為數字類型
  category: 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'
  icon: string
  date: string // 格式為 "2025-05-20"
  created_at: string
  updated_at: string
  user?: { // 消費者資訊
    id: string
    display_name: string | null
    avatar_url: string | null
  }
}

// 用於創建新支出的介面
export interface CreateExpenseData {
  title: string
  amount: number
  category: 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'
  icon: string
  date: string
}

// 支出統計介面
export interface ExpenseStats {
  today: number
  week: number
  month: number
  byCategory: {
    food: number
    pet: number
    shopping: number
    transport: number
    home: number
    other: number
  }
}

export const useExpenseStore = defineStore('expense', () => {
  // 費用記錄
  const expenses = ref<Expense[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // 獲取相關 stores
  const coupleStore = useCoupleStore()
  const notificationStore = useNotificationStore()

  // 計算統計數據
  const stats = computed<ExpenseStats>(() => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const weekStart = new Date(now.setDate(now.getDate() - now.getDay()))
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const todayExpenses = expenses.value.filter(e => e.date === today)
    const weekExpenses = expenses.value.filter(e => new Date(e.date) >= weekStart)
    const monthExpenses = expenses.value.filter(e => new Date(e.date) >= monthStart)

    return {
      today: todayExpenses.reduce((sum, e) => sum + e.amount, 0),
      week: weekExpenses.reduce((sum, e) => sum + e.amount, 0),
      month: monthExpenses.reduce((sum, e) => sum + e.amount, 0),
      byCategory: {
        food: monthExpenses.filter(e => e.category === 'food').reduce((sum, e) => sum + e.amount, 0),
        pet: monthExpenses.filter(e => e.category === 'pet').reduce((sum, e) => sum + e.amount, 0),
        shopping: monthExpenses.filter(e => e.category === 'shopping').reduce((sum, e) => sum + e.amount, 0),
        transport: monthExpenses.filter(e => e.category === 'transport').reduce((sum, e) => sum + e.amount, 0),
        home: monthExpenses.filter(e => e.category === 'home').reduce((sum, e) => sum + e.amount, 0),
        other: monthExpenses.filter(e => e.category === 'other').reduce((sum, e) => sum + e.amount, 0)
      }
    }
  })

  // 🔔 真正的通知觸發邏輯
  const triggerExpenseNotifications = async (expense: Expense) => {
    if (!notificationStore.hasPermission || !notificationStore.settings.enabled) {
      return
    }

    try {
      const categoryNames = {
        food: '餐飲',
        pet: '寵物', 
        shopping: '購物',
        transport: '交通',
        home: '居家',
        other: '其他'
      }

      // 1. 支出添加成功通知
      if (notificationStore.settings.expenseReminders) {
        await notificationStore.showLocalNotification({
          title: '支出記錄已新增 💰',
          body: `${categoryNames[expense.category]} - ${expense.title}: NT$${expense.amount.toLocaleString()}`,
          icon: '/web-app-manifest-192x192.png',
          data: {
            type: 'expense_added',
            expenseId: expense.id,
            category: expense.category,
            amount: expense.amount
          }
        })
      }

      // 2. 預算超支檢查
      if (notificationStore.settings.budgetAlerts && coupleStore.coupleSettings) {
        const currentStats = stats.value
        const monthlyBudget = coupleStore.coupleSettings.monthly_budget || 0
        const categoryBudget = coupleStore.getCategoryBudget(expense.category)

        // 月度總預算檢查
        if (monthlyBudget > 0) {
          const usagePercentage = (currentStats.month / monthlyBudget) * 100
          const coupleSettings = coupleStore.coupleSettings as any
          const warningPercentage = coupleSettings?.notifications?.budget_warning_percentage || 80

          if (usagePercentage >= 100) {
            await notificationStore.showLocalNotification({
              title: '⚠️ 月度預算超支！',
              body: `本月支出 NT$${currentStats.month.toLocaleString()} 已超過預算 NT$${monthlyBudget.toLocaleString()}`,
              requireInteraction: true,
              data: { type: 'budget_exceeded', period: 'monthly' }
            })
          } else if (usagePercentage >= warningPercentage) {
            await notificationStore.showLocalNotification({
              title: '💡 月度預算提醒',
              body: `本月已使用 ${usagePercentage.toFixed(0)}% 預算 (NT$${currentStats.month.toLocaleString()}/${monthlyBudget.toLocaleString()})`,
              data: { type: 'budget_warning', period: 'monthly' }
            })
          }
        }

        // 類別預算檢查
        if (categoryBudget > 0) {
          const categorySpent = currentStats.byCategory[expense.category]
          const categoryUsage = (categorySpent / categoryBudget) * 100

          if (categoryUsage >= 100) {
            await notificationStore.showLocalNotification({
              title: `⚠️ ${categoryNames[expense.category]}預算超支！`,
              body: `${categoryNames[expense.category]}本月支出 NT$${categorySpent.toLocaleString()} 已超過預算 NT$${categoryBudget.toLocaleString()}`,
              requireInteraction: true,
              data: { type: 'category_budget_exceeded', category: expense.category }
            })
          } else if (categoryUsage >= 80) {
            await notificationStore.showLocalNotification({
              title: `💡 ${categoryNames[expense.category]}預算提醒`,
              body: `${categoryNames[expense.category]}已使用 ${categoryUsage.toFixed(0)}% 預算 (NT$${categorySpent.toLocaleString()}/${categoryBudget.toLocaleString()})`,
              data: { type: 'category_budget_warning', category: expense.category }
            })
          }
        }

        // 3. 每日支出提醒 (如果今日支出較高)
        if (currentStats.today >= 1000) {
          await notificationStore.showLocalNotification({
            title: '📊 今日支出統計',
            body: `今日總支出：NT$${currentStats.today.toLocaleString()}`,
            data: { type: 'daily_summary', amount: currentStats.today }
          })
        }
      }

    } catch (error) {
      console.error('觸發支出通知失敗:', error)
    }
  }

  // 獲取當前用戶的所有支出（支援情侶共同消費）
  const fetchExpenses = async () => {
    try {
      loading.value = true
      error.value = null
      
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        throw new Error('用戶未登入')
      }

      let userIds = [userData.user.id]

      // 如果有情侶，獲取情侶中所有成員的 ID
      if (coupleStore.isInCouple && coupleStore.couple?.id) {
        const { data: coupleMembers, error: membersError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('couple_id', coupleStore.couple.id)

        if (membersError) {
          console.error('獲取情侶成員失敗:', membersError)
        } else if (coupleMembers) {
          userIds = coupleMembers.map(member => member.id)
        }
      }

      // 查詢所有相關用戶的消費記錄
      const { data: expensesData, error: supabaseError } = await supabase
        .from('expenses')
        .select('*')
        .in('user_id', userIds)
        .order('date', { ascending: false })

      if (supabaseError) {
        throw supabaseError
      }

      if (!expensesData || expensesData.length === 0) {
        expenses.value = []
        return
      }

      // 獲取所有相關的用戶資料
      const { data: usersData, error: usersError } = await supabase
        .from('user_profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds)

      if (usersError) {
        console.error('獲取用戶資料失敗:', usersError)
      }

      // 合併資料
      const usersMap = new Map(
        (usersData || []).map(user => [user.id, user])
      )

      expenses.value = expensesData.map(expense => ({
        ...expense,
        user: usersMap.get(expense.user_id) || {
          id: expense.user_id,
          display_name: null,
          avatar_url: null
        }
      }))
    } catch (err) {
      console.error('獲取支出記錄失敗:', err)
      error.value = err instanceof Error ? err.message : '未知錯誤'
    } finally {
      loading.value = false
    }
  }

  // 添加新費用
  const addExpense = async (expenseData: CreateExpenseData) => {
    try {
      loading.value = true
      error.value = null

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        throw new Error('用戶未登入')
      }

      const newExpense: ExpenseInsert = {
        ...expenseData,
        user_id: userData.user.id
      }

      const { data, error: supabaseError } = await supabase
        .from('expenses')
        .insert([newExpense])
        .select('*')
        .single()

      if (supabaseError) {
        throw supabaseError
      }

      if (data) {
        // 獲取用戶資料
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('id, display_name, avatar_url')
          .eq('id', data.user_id)
          .single()

        const expenseWithUser = {
          ...data,
          user: userProfile || {
            id: data.user_id,
            display_name: null,
            avatar_url: null
          }
        }

        expenses.value.unshift(expenseWithUser)
        
        // 🔔 真正的通知邏輯！
        await triggerExpenseNotifications(expenseWithUser)
        
        return expenseWithUser
      }

      return data
    } catch (err) {
      console.error('新增支出記錄失敗:', err)
      error.value = err instanceof Error ? err.message : '未知錯誤'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 更新費用
  const updateExpense = async (id: string, updates: Partial<CreateExpenseData>) => {
    try {
      loading.value = true
      error.value = null

      const { data, error: supabaseError } = await supabase
        .from('expenses')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (supabaseError) {
        throw supabaseError
      }

      // 更新本地數據
      const index = expenses.value.findIndex(expense => expense.id === id)
      if (index !== -1 && data) {
        expenses.value[index] = data
      }

      return data
    } catch (err) {
      console.error('更新支出記錄失敗:', err)
      error.value = err instanceof Error ? err.message : '未知錯誤'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 刪除費用
  const deleteExpense = async (id: string) => {
    try {
      loading.value = true
      error.value = null

      const { error: supabaseError } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)

      if (supabaseError) {
        throw supabaseError
      }

      // 從本地數據中移除
      expenses.value = expenses.value.filter(expense => expense.id !== id)
    } catch (err) {
      console.error('刪除支出記錄失敗:', err)
      error.value = err instanceof Error ? err.message : '未知錯誤'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 批量刪除指定日期的所有費用
  const deleteExpensesByDate = async (date: string) => {
    try {
      loading.value = true
      error.value = null

      // 獲取該日期的所有費用ID
      const expensesToDelete = expenses.value.filter(expense => expense.date === date)
      const expenseIds = expensesToDelete.map(expense => expense.id)

      if (expenseIds.length === 0) {
        return
      }

      // 批量刪除
      const { error: supabaseError } = await supabase
        .from('expenses')
        .delete()
        .in('id', expenseIds)

      if (supabaseError) {
        throw supabaseError
      }

      // 從本地數據中移除
      expenses.value = expenses.value.filter(expense => expense.date !== date)
    } catch (err) {
      console.error('批量刪除支出記錄失敗:', err)
      error.value = err instanceof Error ? err.message : '未知錯誤'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 計算屬性：按日期分組的費用
  const expensesByDate = computed(() => {
    const grouped: Record<string, Expense[]> = {}
    expenses.value.forEach(expense => {
      if (!grouped[expense.date]) {
        grouped[expense.date] = []
      }
      grouped[expense.date].push(expense)
    })
    return grouped
  })

  // 計算屬性：每日總消費
  const dailyTotals = computed(() => {
    const totals: Record<string, number> = {}
    Object.keys(expensesByDate.value).forEach(date => {
      const dayExpenses = expensesByDate.value[date]
      totals[date] = dayExpenses.reduce((sum, expense) => {
        return sum + expense.amount
      }, 0)
    })
    return totals
  })

  // 計算屬性：按類別分組的費用統計
  const expensesByCategory = computed(() => {
    const categoryStats: Record<string, { total: number; count: number; expenses: Expense[] }> = {}
    
    expenses.value.forEach(expense => {
      if (!categoryStats[expense.category]) {
        categoryStats[expense.category] = {
          total: 0,
          count: 0,
          expenses: []
        }
      }
      
      categoryStats[expense.category].total += expense.amount
      categoryStats[expense.category].count += 1
      categoryStats[expense.category].expenses.push(expense)
    })
    
    return categoryStats
  })

  // 計算屬性：月度統計
  const monthlyStats = computed(() => {
    const monthly: Record<string, Record<string, number>> = {}
    
    expenses.value.forEach(expense => {
      const month = expense.date.substring(0, 7) // "2025-05"
      
      if (!monthly[month]) {
        monthly[month] = {}
      }
      
      if (!monthly[month][expense.category]) {
        monthly[month][expense.category] = 0
      }
      
      monthly[month][expense.category] += expense.amount
    })
    
    return monthly
  })

  // 計算屬性：年度統計
  const yearlyStats = computed(() => {
    const yearly: Record<string, Record<string, number>> = {}
    
    expenses.value.forEach(expense => {
      const year = expense.date.substring(0, 4) // "2025"
      
      if (!yearly[year]) {
        yearly[year] = {}
      }
      
      if (!yearly[year][expense.category]) {
        yearly[year][expense.category] = 0
      }
      
      yearly[year][expense.category] += expense.amount
    })
    
    return yearly
  })

  // 計算屬性：按用戶分組的消費統計（情侶模式）
  const expensesByUser = computed(() => {
    if (!coupleStore.isInCouple) return {}
    
    const userStats: Record<string, {
      total: number
      count: number
      expenses: Expense[]
      user: {
        id: string
        display_name: string | null
        avatar_url: string | null
      }
    }> = {}
    
    expenses.value.forEach(expense => {
      const userId = expense.user_id
      const userInfo = expense.user || {
        id: userId,
        display_name: null,
        avatar_url: null
      }
      
      if (!userStats[userId]) {
        userStats[userId] = {
          total: 0,
          count: 0,
          expenses: [],
          user: userInfo
        }
      }
      
      userStats[userId].total += expense.amount
      userStats[userId].count += 1
      userStats[userId].expenses.push(expense)
    })
    
    return userStats
  })

  // 計算屬性：消費比例（情侶模式）
  const spendingRatio = computed(() => {
    if (!coupleStore.isInCouple) return null
    
    const stats = expensesByUser.value
    const userIds = Object.keys(stats)
    
    if (userIds.length !== 2) return null
    
    const total = Object.values(stats).reduce((sum, stat) => sum + stat.total, 0)
    
    if (total === 0) return null
    
    const ratios: Record<string, {
      percentage: number
      amount: number
      user: any
    }> = {}
    
    userIds.forEach(userId => {
      ratios[userId] = {
        percentage: Math.round((stats[userId].total / total) * 100),
        amount: stats[userId].total,
        user: stats[userId].user
      }
    })
    
    return ratios
  })

  // 計算屬性：當月按用戶分組的消費統計
  const monthlyExpensesByUser = computed(() => {
    if (!coupleStore.isInCouple) return {}
    
    const currentMonth = new Date().toISOString().substring(0, 7)
    const monthlyExpenses = expenses.value.filter(expense => expense.date.startsWith(currentMonth))
    
    const userStats: Record<string, {
      total: number
      count: number
      user: any
    }> = {}
    
    monthlyExpenses.forEach(expense => {
      const userId = expense.user_id
      const userInfo = expense.user || {
        id: userId,
        display_name: null,
        avatar_url: null
      }
      
      if (!userStats[userId]) {
        userStats[userId] = {
          total: 0,
          count: 0,
          user: userInfo
        }
      }
      
      userStats[userId].total += expense.amount
      userStats[userId].count += 1
    })
    
    return userStats
  })

  // 類別顯示名稱對應
  const categoryLabels: Record<string, string> = {
    food: '餐飲',
    pet: '寵物',
    shopping: '購物',
    transport: '交通',
    home: '居家',
    other: '其他'
  }

  // 獲取特定日期的費用
  const getExpensesByDate = (date: string) => {
    return expensesByDate.value[date] || []
  }

  // 獲取日期範圍內的費用
  const getExpensesByDateRange = (startDate: string, endDate: string) => {
    return expenses.value.filter(expense => 
      expense.date >= startDate && expense.date <= endDate
    )
  }

  // 格式化金額顯示（保持舊的顯示格式）
  const formatAmount = (amount: number) => {
    return `-NT ${amount.toFixed(0)}`
  }

  // 資料載入由 App.vue 統一控制

  return {
    expenses,
    loading,
    error,
    stats,
    fetchExpenses,
    addExpense,
    updateExpense,
    deleteExpense,
    deleteExpensesByDate,
    expensesByDate,
    dailyTotals,
    expensesByCategory,
    monthlyStats,
    yearlyStats,
    expensesByUser,
    spendingRatio,
    monthlyExpensesByUser,
    categoryLabels,
    getExpensesByDate,
    getExpensesByDateRange,
    formatAmount
  }
}, {
  persist: false // 關閉本地持久化，因為數據現在來自 Supabase
})