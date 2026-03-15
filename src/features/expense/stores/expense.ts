import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/shared/lib/supabase'
import type { ExpenseRow, ExpenseInsert, SplitMethod, CurrencyType } from '@/shared/lib/database.types'
import type { CategoryId, ExpenseUser } from '@/entities/expense/types'
import { useGroupStore } from '@/features/group/stores/group'
import { useSplitStore } from '@/features/split/stores/split'

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
    'food', 'pet', 'shopping', 'transport', 'home', 'other'
])

function toValidCategory(value: unknown): CategoryId {
    if (typeof value === 'string' && VALID_CATEGORIES.has(value)) {
        return value as CategoryId
    }
    return 'other'
}

export interface Expense {
    id: string
    user_id: string
    group_id: string | null
    title: string
    amount: number
    category: CategoryId
    icon: string | null
    date: string
    currency: CurrencyType
    split_method: SplitMethod | null
    paid_by: string | null
    notes: string | null
    is_settled: boolean
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
    group_id?: string | null
    currency?: CurrencyType
    split_method?: SplitMethod
    paid_by?: string
    notes?: string
    splits?: Array<{
        userId: string
        amount: number
        percentage?: number
        shares?: number
    }>
}

export interface UpdateExpenseData {
    title?: string
    amount?: number
    category?: CategoryId
    icon?: string
    date?: string
    group_id?: string | null
    currency?: CurrencyType
    split_method?: SplitMethod | null
    paid_by?: string | null
    notes?: string | null
    is_settled?: boolean
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

    // 記住上次選擇的 group（用於新增支出時的預設值）
    const lastUsedGroupId = ref<string | null>(null)

    // 當前使用者 ID（用於過濾個人支出）
    const currentUserId = ref<string | null>(null)

    // 個人模式下，使用者被分配 split 的 expense_id 集合（用於 allMyExpenses 兜底判斷）
    const mySplitExpenseIds = ref<Set<string>>(new Set())

    // 預載狀態
    const preloadStatus = ref<'idle' | 'loading' | 'done' | 'error'>('idle')

    // 完整歷史是否已載入（向後相容）
    const fullHistoryLoaded = computed(() => preloadStatus.value === 'done')

    // 輔助函數：計算統計數據（單次遍歷）
    const calculateStatsForExpenses = (expenseList: Expense[]): ExpenseStats => {
        const now = new Date()
        const todayStr = now.toISOString().split('T')[0]
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - now.getDay())
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

        let today = 0
        let week = 0
        let month = 0
        const byCategory: Record<string, number> = {
            food: 0, pet: 0, shopping: 0, transport: 0, home: 0, other: 0
        }

        for (const e of expenseList) {
            const d = new Date(e.date)
            if (e.date === todayStr) today += e.amount
            if (d >= weekStart) week += e.amount
            if (d >= monthStart) {
                month += e.amount
                byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount
            }
        }

        return {
            today,
            week,
            month,
            byCategory: byCategory as Record<CategoryId, number>
        }
    }

    // 計算統計數據（所有已載入的支出）
    const stats = computed<ExpenseStats>(() => calculateStatsForExpenses(expenses.value))

    // 計算屬性：個人支出（group_id 為 null 且屬於自己）
    const personalExpenses = computed(() =>
        expenses.value.filter(e =>
            e.group_id === null && e.user_id === currentUserId.value
        )
    )

    // 計算屬性：使用者的所有支出（包含個人、自建群組消費、及群組中他人建立但分配給自己的消費）
    const allMyExpenses = computed(() => {
        const userId = currentUserId.value
        if (!userId) return []
        const splitStore = useSplitStore()
        return expenses.value.filter(e => {
            if (e.user_id === userId) return true
            // 優先使用 Phase 1 快取的 split expense_id 集合作為兜底
            if (mySplitExpenseIds.value.has(e.id)) return true
            if (e.group_id !== null) {
                const splits = splitStore.getSplitsForExpense(e.id)
                return splits.some(s => s.user_id === userId)
            }
            return false
        })
    })

    // 計算屬性：群組支出（屬於目前活躍群組）
    const groupExpenses = computed(() => {
        const groupStore = useGroupStore()
        const activeGroupId = groupStore.activeGroupId
        if (!activeGroupId) return []
        return expenses.value.filter(e => e.group_id === activeGroupId)
    })

    // 計算屬性：個人支出統計
    const personalStats = computed<ExpenseStats>(() =>
        calculateStatsForExpenses(personalExpenses.value)
    )

    // 計算屬性：使用者的實際支出（個人全額 + 群組分帳份額）
    const mySpendingExpenses = computed(() => {
        const splitStore = useSplitStore()
        const userId = currentUserId.value
        if (!userId) return []

        const result: Expense[] = []
        const seen = new Set<string>()

        // 1. 個人消費：使用完整金額
        for (const e of expenses.value) {
            if (e.group_id === null && e.user_id === userId) {
                result.push(e)
                seen.add(e.id)
            }
        }

        // 2. 群組消費：使用分帳份額
        for (const e of expenses.value) {
            if (e.group_id !== null && !seen.has(e.id)) {
                const splits = splitStore.getSplitsForExpense(e.id)
                const mySplit = splits.find(s => s.user_id === userId)
                if (mySplit) {
                    result.push({ ...e, amount: mySplit.amount })
                    seen.add(e.id)
                }
            }
        }

        return result
    })

    // 計算屬性：使用者的實際支出統計
    const mySpendingStats = computed<ExpenseStats>(() =>
        calculateStatsForExpenses(mySpendingExpenses.value)
    )

    // 計算屬性：群組支出統計
    const groupStats = computed<ExpenseStats>(() =>
        calculateStatsForExpenses(groupExpenses.value)
    )

    // 計算屬性：按日期分組的個人支出
    const personalExpensesByDate = computed(() => {
        const grouped: Record<string, Expense[]> = {}
        personalExpenses.value.forEach(expense => {
            if (!grouped[expense.date]) {
                grouped[expense.date] = []
            }
            grouped[expense.date] = [...(grouped[expense.date] ?? []), expense]
        })
        return grouped
    })

    // 計算屬性：按日期分組的群組支出
    const groupExpensesByDate = computed(() => {
        const grouped: Record<string, Expense[]> = {}
        groupExpenses.value.forEach(expense => {
            if (!grouped[expense.date]) {
                grouped[expense.date] = []
            }
            grouped[expense.date] = [...(grouped[expense.date] ?? []), expense]
        })
        return grouped
    })

    // 輔助函數：將 row 資料與用戶 map 合併為 Expense
    const mapRowToExpense = (
        row: ExpenseRow,
        usersMap: Map<string, ExpenseUser>
    ): Expense => ({
        id: row.id,
        user_id: row.user_id,
        group_id: row.group_id,
        title: row.title,
        amount: row.amount,
        category: toValidCategory(row.category),
        icon: row.icon,
        date: row.date,
        currency: row.currency,
        split_method: row.split_method,
        paid_by: row.paid_by,
        notes: row.notes,
        is_settled: row.is_settled,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user: usersMap.get(row.user_id) ?? {
            id: row.user_id,
            display_name: null,
            avatar_url: null
        }
    })

    // 輔助函數：批次查詢用戶資料並建立 map
    const fetchUsersMap = async (userIds: string[]): Promise<Map<string, ExpenseUser>> => {
        if (userIds.length === 0) return new Map()

        const { data: usersData, error: usersError } = await supabase
            .from('user_profiles')
            .select('id, display_name, avatar_url')
            .in('id', userIds)

        if (usersError) {
            console.error('獲取用戶資料失敗:', usersError)
        }

        return new Map(
            (usersData || []).map(user => [user.id, user])
        )
    }

    // 獲取當前用戶的支出（支援個人/群組模式）
    const fetchExpenses = async (groupId?: string | null) => {
        try {
            loading.value = true
            error.value = null

            const { data: userData } = await supabase.auth.getUser()
            if (!userData.user) {
                throw new Error('用戶未登入')
            }

            const userId = userData.user.id
            currentUserId.value = userId

            const groupStore = useGroupStore()
            const targetGroupId = groupId !== undefined ? groupId : groupStore.activeGroupId

            let expensesData: ExpenseRow[] = []

            if (targetGroupId) {
                // 群組模式：查詢群組支出 + 使用者的個人支出
                const { data, error: supabaseError } = await supabase
                    .from('expenses')
                    .select('*')
                    .or(`group_id.eq.${targetGroupId},and(user_id.eq.${userId},group_id.is.null)`)
                    .order('date', { ascending: false })

                if (supabaseError) {
                    throw supabaseError
                }
                expensesData = data || []
            } else {
                // 個人模式：查詢自己的所有支出 + 群組中他人建立但分配給自己的支出
                // Phase 1: 並行查詢自己建立的支出 & 自己被分配的 splits
                const [ownResult, splitsResult] = await Promise.all([
                    supabase
                        .from('expenses')
                        .select('*')
                        .eq('user_id', userId)
                        .order('date', { ascending: false }),
                    supabase
                        .from('expense_splits')
                        .select('expense_id')
                        .eq('user_id', userId)
                ])

                if (ownResult.error) throw ownResult.error
                if (splitsResult.error) throw splitsResult.error

                const ownExpenses = ownResult.data || []
                const ownIds = new Set(ownExpenses.map(e => e.id))

                // 記錄使用者被分配 split 的 expense_id，供 allMyExpenses 兜底使用
                const splitExpenseIds = new Set((splitsResult.data || []).map(s => s.expense_id))
                mySplitExpenseIds.value = splitExpenseIds

                // Phase 2: 找出自己有 split 但不在自己建立的支出中的 expense_id
                const missingIds = [...splitExpenseIds].filter(id => !ownIds.has(id))

                if (missingIds.length > 0) {
                    const { data: extraExpenses, error: extraError } = await supabase
                        .from('expenses')
                        .select('*')
                        .in('id', [...new Set(missingIds)])

                    if (extraError) throw extraError

                    expensesData = [...ownExpenses, ...(extraExpenses || [])]
                        .sort((a, b) => b.date.localeCompare(a.date))
                } else {
                    expensesData = ownExpenses
                }
            }

            if (expensesData.length === 0) {
                expenses.value = []
                return
            }

            const allUserIds = [...new Set(expensesData.map(e => e.user_id))]
            const usersMap = await fetchUsersMap(allUserIds)

            expenses.value = expensesData.map(row => mapRowToExpense(row, usersMap))

            // 批次載入群組消費的 splits（用於計算個人分帳份額）
            const groupExpenseIds = expensesData
                .filter(e => e.group_id !== null)
                .map(e => e.id)

            if (groupExpenseIds.length > 0) {
                const splitStore = useSplitStore()
                await splitStore.fetchSplitsForExpenses(groupExpenseIds)
            }
        } catch (err) {
            console.error('獲取支出記錄失敗:', err)
            error.value = err instanceof Error ? err.message : '未知錯誤'
            throw err
        } finally {
            loading.value = false
        }
    }

    // 只獲取特定群組的支出（不含個人支出）
    const fetchGroupExpenses = async (groupId: string) => {
        try {
            loading.value = true
            error.value = null

            const { data, error: supabaseError } = await supabase
                .from('expenses')
                .select('*')
                .eq('group_id', groupId)
                .order('date', { ascending: false })

            if (supabaseError) {
                throw supabaseError
            }

            const expensesData: ExpenseRow[] = data || []

            if (expensesData.length === 0) {
                // 只清除屬於這個群組的支出，保留其他資料
                expenses.value = expenses.value.filter(e => e.group_id !== groupId)
                return
            }

            const allUserIds = [...new Set(expensesData.map(e => e.user_id))]
            const usersMap = await fetchUsersMap(allUserIds)

            const groupExpensesMapped = expensesData.map(row => mapRowToExpense(row, usersMap))

            // 合併：移除舊的群組支出，加入新取得的
            const withoutThisGroup = expenses.value.filter(e => e.group_id !== groupId)
            expenses.value = [...withoutThisGroup, ...groupExpensesMapped].sort(
                (a, b) => b.date.localeCompare(a.date)
            )
        } catch (err) {
            console.error('獲取群組支出記錄失敗:', err)
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

            const groupStore = useGroupStore()
            const groupId = expenseData.group_id !== undefined
                ? expenseData.group_id
                : groupStore.activeGroupId

            // 記住這次使用的群組
            lastUsedGroupId.value = groupId ?? null

            const newExpense: ExpenseInsert = {
                title: expenseData.title,
                amount: expenseData.amount,
                category: expenseData.category,
                icon: expenseData.icon,
                date: expenseData.date,
                group_id: groupId || null,
                currency: expenseData.currency || 'TWD',
                split_method: expenseData.split_method || null,
                paid_by: expenseData.paid_by || userData.user.id,
                notes: expenseData.notes || null,
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
                if (groupId && expenseData.splits && expenseData.splits.length > 0) {
                    const splitRows = expenseData.splits.map(split => ({
                        expense_id: data.id,
                        user_id: split.userId,
                        amount: split.amount,
                        percentage: split.percentage ?? null,
                        shares: split.shares ?? null,
                        is_settled: false
                    }))

                    const { error: splitError } = await supabase
                        .from('expense_splits')
                        .upsert(splitRows, { onConflict: 'expense_id,user_id' })

                    if (splitError) {
                        throw splitError
                    }
                }

                const { data: userProfile } = await supabase
                    .from('user_profiles')
                    .select('id, display_name, avatar_url')
                    .eq('id', data.user_id)
                    .single()

                const usersMap = new Map<string, ExpenseUser>()
                if (userProfile) {
                    usersMap.set(userProfile.id, userProfile)
                }

                const expenseWithUser = mapRowToExpense(data, usersMap)
                expenses.value = [expenseWithUser, ...expenses.value]

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
    const updateExpense = async (id: string, updates: UpdateExpenseData) => {
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

            // 更新本地資料（保留既有的 user 資訊）
            const index = expenses.value.findIndex(expense => expense.id === id)
            if (index !== -1 && data) {
                const existingUser = expenses.value[index]?.user
                const usersMap = new Map<string, ExpenseUser>()
                if (existingUser) {
                    usersMap.set(existingUser.id, existingUser)
                }
                expenses.value = expenses.value.map((expense, i) =>
                    i === index ? mapRowToExpense(data, usersMap) : expense
                )
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

            const expenseIds = expenses.value
                .filter(expense => expense.date === date)
                .map(expense => expense.id)

            if (expenseIds.length === 0) return

            const { error: supabaseError } = await supabase
                .from('expenses')
                .delete()
                .in('id', expenseIds)

            if (supabaseError) {
                throw supabaseError
            }

            expenses.value = expenses.value.filter(expense => expense.date !== date)
        } catch (err) {
            console.error('批量刪除支出記錄失敗:', err)
            error.value = err instanceof Error ? err.message : '未知錯誤'
            throw err
        } finally {
            loading.value = false
        }
    }

    // 計算屬性：按日期分組的費用（全部）
    const expensesByDate = computed(() => {
        const grouped: Record<string, Expense[]> = {}
        expenses.value.forEach(expense => {
            if (!grouped[expense.date]) {
                grouped[expense.date] = []
            }
            grouped[expense.date] = [...(grouped[expense.date] ?? []), expense]
        })
        return grouped
    })

    // 計算屬性：每日總消費
    const dailyTotals = computed(() => {
        const totals: Record<string, number> = {}
        Object.keys(expensesByDate.value).forEach(date => {
            totals[date] = (expensesByDate.value[date] ?? []).reduce((sum, expense) => sum + expense.amount, 0)
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

            const current = categoryStats[expense.category]!
            categoryStats[expense.category] = {
                total: current.total + expense.amount,
                count: current.count + 1,
                expenses: [...current.expenses, expense]
            }
        })

        return categoryStats
    })

    // 計算屬性：月度統計
    const monthlyStats = computed(() => {
        const monthly: Record<string, Record<string, number>> = {}

        expenses.value.forEach(expense => {
            const month = expense.date.substring(0, 7) // "2025-05"

            const existingMonth = monthly[month] ?? {}
            monthly[month] = {
                ...existingMonth,
                [expense.category]: (existingMonth[expense.category] ?? 0) + expense.amount
            }
        })

        return monthly
    })

    // 計算屬性：年度統計
    const yearlyStats = computed(() => {
        const yearly: Record<string, Record<string, number>> = {}

        expenses.value.forEach(expense => {
            const year = expense.date.substring(0, 4) // "2025"

            const existingYear = yearly[year] ?? {}
            yearly[year] = {
                ...existingYear,
                [expense.category]: (existingYear[expense.category] ?? 0) + expense.amount
            }
        })

        return yearly
    })

    // 計算屬性：按用戶分組的消費統計
    const expensesByUser = computed(() => {
        const userStats: Record<string, {
            total: number
            count: number
            expenses: Expense[]
            user: ExpenseUser
        }> = {}

        expenses.value.forEach(expense => {
            const userId = expense.user_id
            const userInfo = expense.user ?? {
                id: userId,
                display_name: null,
                avatar_url: null
            }

            const existing = userStats[userId]
            userStats[userId] = {
                total: (existing?.total ?? 0) + expense.amount,
                count: (existing?.count ?? 0) + 1,
                expenses: [...(existing?.expenses ?? []), expense],
                user: userInfo
            }
        })

        return userStats
    })

    // 類別顯示名稱對應（靜態中文 fallback，主要由 ChartView 圖表 config 使用）
    // 建議未來改用 i18n t('expense.categories.*') 取代
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

    // 格式化金額顯示
    const formatAmount = (amount: number) => {
        return `-NT ${amount.toFixed(0)}`
    }

    return {
        // 基本狀態
        expenses,
        loading,
        error,
        lastUsedGroupId,
        currentUserId,
        preloadStatus,

        // 統計數據
        stats,
        personalStats,
        mySpendingStats,
        groupStats,

        // 個人/群組支出
        personalExpenses,
        mySpendingExpenses,
        allMyExpenses,
        groupExpenses,
        personalExpensesByDate,
        groupExpensesByDate,

        // 完整歷史標記（向後相容）
        fullHistoryLoaded,

        // 方法
        fetchExpenses,
        fetchGroupExpenses,
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

        // 用戶統計
        expensesByUser,

        // 工具
        categoryLabels,
        getExpensesByDate,
        getExpensesByDateRange,
        formatAmount
    }
}, {
    persist: {
        pick: ['lastUsedGroupId']
    }
})
