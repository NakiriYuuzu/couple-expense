import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/shared/lib/supabase'
import { useFamilyStore } from '@/features/family/stores/family'
import type { ExpenseRow, ExpenseInsert, ExpenseScope } from '@/shared/lib/database.types'
import type { CategoryId, ExpenseUser } from '@/entities/expense/types'

export interface Expense {
  id: string
  user_id: string
  title: string
  amount: number
  category: CategoryId
  icon: string
  date: string
  scope: ExpenseScope
  created_at: string
  updated_at: string
  user?: ExpenseUser
}

// 用於創建新支出的介面
export interface CreateExpenseData {
  title: string
  amount: number
  category: CategoryId
  icon: string
  date: string
  scope?: ExpenseScope
}

// 支出統計介面
export interface ExpenseStats {
  today: number
  week: number
  month: number
  byCategory: Record<CategoryId, number>
}

export const useExpenseStore = defineStore('expense', () => {
  // 費用記錄
  const expenses = ref<Expense[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 記住上次選擇的 scope（用於新增支出時的預設值）
  const lastUsedScope = ref<ExpenseScope>('personal')

  // 當前使用者 ID（用於過濾個人支出）
  const currentUserId = ref<string | null>(null)

  // 獲取相關 stores
  const familyStore = useFamilyStore()

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

  // 計算屬性：個人支出（只有自己的 personal scope）
  const personalExpenses = computed(() =>
    expenses.value.filter(e =>
      e.scope === 'personal' && e.user_id === currentUserId.value
    )
  )

  // 計算屬性：家庭支出（家庭所有成員的 family scope）
  const familyExpenses = computed(() =>
    expenses.value.filter(e => e.scope === 'family')
  )

  // 輔助函數：計算統計數據
  const calculateStatsForExpenses = (expenseList: Expense[]): ExpenseStats => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const todayExpenses = expenseList.filter(e => e.date === today)
    const weekExpenses = expenseList.filter(e => new Date(e.date) >= weekStart)
    const monthExpenses = expenseList.filter(e => new Date(e.date) >= monthStart)

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
  }

  // 計算屬性：個人支出統計
  const personalStats = computed<ExpenseStats>(() =>
    calculateStatsForExpenses(personalExpenses.value)
  )

  // 計算屬性：家庭支出統計
  const familyStats = computed<ExpenseStats>(() =>
    calculateStatsForExpenses(familyExpenses.value)
  )

  // 計算屬性：按日期分組的個人支出
  const personalExpensesByDate = computed(() => {
    const grouped: Record<string, Expense[]> = {}
    personalExpenses.value.forEach(expense => {
      if (!grouped[expense.date]) {
        grouped[expense.date] = []
      }
      grouped[expense.date].push(expense)
    })
    return grouped
  })

  // 計算屬性：按日期分組的家庭支出
  const familyExpensesByDate = computed(() => {
    const grouped: Record<string, Expense[]> = {}
    familyExpenses.value.forEach(expense => {
      if (!grouped[expense.date]) {
        grouped[expense.date] = []
      }
      grouped[expense.date].push(expense)
    })
    return grouped
  })

  // 獲取當前用戶的所有支出（支援個人/家庭分類）
  const fetchExpenses = async () => {
    try {
      loading.value = true
      error.value = null

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        throw new Error('用戶未登入')
      }

      const userId = userData.user.id
      currentUserId.value = userId

      let familyMemberIds: string[] = [userId]

      // 如果有家庭，獲取家庭中所有成員的 ID
      if (familyStore.isInFamily && familyStore.family?.id) {
        const { data: familyMembers, error: membersError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('family_id', familyStore.family.id)

        if (membersError) {
          console.error('獲取家庭成員失敗:', membersError)
        } else if (familyMembers) {
          familyMemberIds = familyMembers.map(member => member.id)
        }
      }

      // 查詢邏輯：
      // 1. 自己的 personal 支出（只有自己可見）
      // 2. 家庭所有成員的 family 支出（共享可見）
      let expensesData: ExpenseRow[] = []

      if (familyStore.isInFamily) {
        // 家庭模式：查詢自己的 personal + 所有成員的 family
        const { data, error: supabaseError } = await supabase
          .from('expenses')
          .select('*')
          .or(`and(user_id.eq.${userId},scope.eq.personal),and(user_id.in.(${familyMemberIds.join(',')}),scope.eq.family)`)
          .order('date', { ascending: false })

        if (supabaseError) {
          throw supabaseError
        }
        expensesData = data || []
      } else {
        // 單人模式：只查詢自己的所有支出
        const { data, error: supabaseError } = await supabase
          .from('expenses')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: false })

        if (supabaseError) {
          throw supabaseError
        }
        expensesData = data || []
      }

      if (expensesData.length === 0) {
        expenses.value = []
        return
      }

      // 獲取所有相關的用戶資料
      const allUserIds = [...new Set(expensesData.map(e => e.user_id))]
      const { data: usersData, error: usersError } = await supabase
        .from('user_profiles')
        .select('id, display_name, avatar_url')
        .in('id', allUserIds)

      if (usersError) {
        console.error('獲取用戶資料失敗:', usersError)
      }

      // 合併資料
      const usersMap = new Map(
        (usersData || []).map(user => [user.id, user])
      )

      expenses.value = expensesData.map(expense => ({
        ...expense,
        scope: expense.scope as ExpenseScope,
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

      // 決定 scope：使用傳入的值，或使用上次選擇的值，或預設為 'personal'
      const scope = expenseData.scope || lastUsedScope.value || 'personal'

      // 記住這次選擇
      lastUsedScope.value = scope

      const newExpense: ExpenseInsert = {
        title: expenseData.title,
        amount: expenseData.amount,
        category: expenseData.category,
        icon: expenseData.icon,
        date: expenseData.date,
        scope: scope,
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

        const expenseWithUser: Expense = {
          ...data,
          scope: data.scope as ExpenseScope,
          user: userProfile || {
            id: data.user_id,
            display_name: null,
            avatar_url: null
          }
        }

        expenses.value.unshift(expenseWithUser)

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

  // 計算屬性：按用戶分組的消費統計（家庭模式）
  const expensesByUser = computed(() => {
    if (!familyStore.isInFamily) return {}
    
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

  // 計算屬性：消費比例（家庭模式）
  const spendingRatio = computed(() => {
    if (!familyStore.isInFamily) return null
    
    const stats = expensesByUser.value
    const userIds = Object.keys(stats)
    
    if (userIds.length !== 2) return null
    
    const total = Object.values(stats).reduce((sum, stat) => sum + stat.total, 0)
    
    if (total === 0) return null
    
    const ratios: Record<string, {
      percentage: number
      amount: number
      user: ExpenseUser
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
    if (!familyStore.isInFamily) return {}
    
    const currentMonth = new Date().toISOString().substring(0, 7)
    const monthlyExpenses = expenses.value.filter(expense => expense.date.startsWith(currentMonth))
    
    const userStats: Record<string, {
      total: number
      count: number
      user: ExpenseUser
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
    // 基本狀態
    expenses,
    loading,
    error,
    lastUsedScope,
    currentUserId,

    // 統計數據
    stats,
    personalStats,
    familyStats,

    // 個人/家庭支出
    personalExpenses,
    familyExpenses,
    personalExpensesByDate,
    familyExpensesByDate,

    // 方法
    fetchExpenses,
    addExpense,
    updateExpense,
    deleteExpense,
    deleteExpensesByDate,

    // 按日期分組
    expensesByDate,
    dailyTotals,

    // 按類別分組
    expensesByCategory,
    monthlyStats,
    yearlyStats,

    // 家庭模式統計
    expensesByUser,
    spendingRatio,
    monthlyExpensesByUser,

    // 工具
    categoryLabels,
    getExpensesByDate,
    getExpensesByDateRange,
    formatAmount
  }
}, {
  persist: {
    // 只持久化 lastUsedScope，其他資料來自 Supabase
    pick: ['lastUsedScope']
  }
})