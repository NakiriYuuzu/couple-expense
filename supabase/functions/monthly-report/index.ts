// Edge Function: monthly-report
//
// 用途：每月彙整前月個人 + 群組支出，寫入 group_expense.monthly_reports，並為未推播列逐一呼叫 send-push。
//
// 呼叫端驗證：沿用 send-push 的雙軌邏輯，兩條主線任一成立即可（OR）：
// (a) Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// (b) x-webhook-secret == SEND_PUSH_WEBHOOK_SECRET
//
// 重要：本函式預設 verify_jwt = true。send-push 本體已註明，這種平台設定下若 Authorization
// 缺席，無法先過平台層即被 401 擋下，x-webhook-secret 不會被觸發檢查到。
// 因此 monthly-report cron 與 DB 端呼叫皆以 Authorization 通道為主。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type MonthlyReportEvent = 'monthly_report'

type CategorySummary = {
    category: string
    amount: number
}

type GroupSummary = {
    groupId: string
    groupName: string
    splitAmount: number
    settledAmount: number
    unsettledAmount: number
}

type MonthlyReportPayload = {
    yearMonth: string
    personal: {
        total: number
        expenseCount: number
        byCategory: CategorySummary[]
    }
    group: {
        splitTotal: number
        groups: GroupSummary[]
    }
    mom: {
        prevTotal: number
        delta: number
        deltaPct: number | null
    }
    generatedAt: string
}

type ExpenseRow = {
    id: string
    group_id: string | null
    amount: number | string
    category: string
    paid_by: string | null
}

type ExpenseSplitRow = {
    expense_id: string
    user_id: string
    amount: number | string
    is_settled: boolean | null
}

interface SendPushPayload {
    userIds: string[]
    event: MonthlyReportEvent
    title: string
    body: string
    data: {
        url: string
    }
}

const MONTH_LABEL_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const HTTP_OK_MIN = 200
const HTTP_OK_MAX = 299
const PAGE_SIZE = 1000
const IN_CLAUSE_CHUNK_SIZE = 200

type SendPushResponse = {
    sent: number
    failed: number
    unregisteredRemoved: number
    skippedByPrefs: number
}

function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size))
    }
    return chunks
}

async function fetchAllPages<T>(buildQuery: (from: number, to: number) => any): Promise<T[]> {
    const rows: T[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1)
        if (error) {
            throw new Error(`paged fetch failed: ${error.message}`)
        }

        const batch = (data ?? []) as T[]
        rows.push(...batch)
        if (batch.length < PAGE_SIZE) {
            break
        }
    }
    return rows
}

function isAuthorized(req: Request, supabaseServiceKey: string): boolean {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (authHeader === `Bearer ${supabaseServiceKey}`) {
        return true
    }

    const webhookSecret = Deno.env.get('SEND_PUSH_WEBHOOK_SECRET')
    if (!webhookSecret) {
        return false
    }
    return req.headers.get('x-webhook-secret') === webhookSecret
}

function isValidRequestBody(value: unknown): value is { yearMonth?: string } {
    if (!value || typeof value !== 'object') {
        return true
    }

    const body = value as { yearMonth?: unknown }
    if (body.yearMonth === undefined) {
        return true
    }

    return typeof body.yearMonth === 'string' && MONTH_LABEL_RE.test(body.yearMonth)
}

function toNumber(value: unknown): number {
    const num = Number(value)
    return Number.isFinite(num) ? num : 0
}

function getTaipeiPreviousMonthLabel(now = new Date()): string {
    const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000)
    const year = taipei.getUTCFullYear()
    const month = taipei.getUTCMonth() + 1

    const targetMonth = month === 1 ? 12 : month - 1
    const targetYear = month === 1 ? year - 1 : year

    return `${targetYear}-${String(targetMonth).padStart(2, '0')}`
}

function getMonthRange(yearMonth: string): { startDate: string; endDate: string } {
    const year = Number(yearMonth.slice(0, 4))
    const month = Number(yearMonth.slice(5, 7))

    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year

    return {
        startDate: `${yearMonth}-01`,
        endDate: `${String(nextYear)}-${String(nextMonth).padStart(2, '0')}-01`
    }
}

function getPreviousYearMonth(yearMonth: string): string {
    const year = Number(yearMonth.slice(0, 4))
    const month = Number(yearMonth.slice(5, 7))

    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year

    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`
}

function getMonthNumber(yearMonth: string): number {
    return Number(yearMonth.slice(5, 7))
}

function extractReportTotal(payload: MonthlyReportPayload): number {
    return payload.personal.total + payload.group.splitTotal
}

function buildMonthSummary(
    expenses: ExpenseRow[],
    splits: ExpenseSplitRow[],
    expenseById: Map<string, ExpenseRow>,
    groupNameById: Map<string, string>
): Map<string, {
    personalTotal: number
    personalCount: number
    byCategory: Map<string, number>
    groupSplitTotal: number
    groupRows: Map<string, {
        groupId: string
        groupName: string
        splitAmount: number
        settledAmount: number
        unsettledAmount: number
    }>
}> {
    const activeUsers = new Set<string>()
    const personalTotalByUser = new Map<string, number>()
    const personalCountByUser = new Map<string, number>()
    const byCategoryByUser = new Map<string, Map<string, number>>()
    const groupSplitByUser = new Map<string, {
        total: number
        groups: Map<string, {
            groupId: string
            groupName: string
            splitAmount: number
            settledAmount: number
            unsettledAmount: number
        }>
    }>()

    for (const expense of expenses) {
        if (!expense.paid_by) {
            continue
        }

        activeUsers.add(expense.paid_by)

        if (expense.group_id !== null) {
            continue
        }

        const amount = toNumber(expense.amount)
        personalTotalByUser.set(expense.paid_by, (personalTotalByUser.get(expense.paid_by) ?? 0) + amount)
        personalCountByUser.set(expense.paid_by, (personalCountByUser.get(expense.paid_by) ?? 0) + 1)

        const byCategory = byCategoryByUser.get(expense.paid_by) ?? new Map<string, number>()
        byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + amount)
        byCategoryByUser.set(expense.paid_by, byCategory)
    }

    for (const split of splits) {
        if (!split.user_id) {
            continue
        }

        const expense = expenseById.get(split.expense_id)
        if (!expense) {
            continue
        }

        activeUsers.add(split.user_id)

        if (expense.group_id === null) {
            continue
        }

        const userGroup = groupSplitByUser.get(split.user_id) ?? {
            total: 0,
            groups: new Map<string, {
                groupId: string
                groupName: string
                splitAmount: number
                settledAmount: number
                unsettledAmount: number
            }>()
        }

        const amount = toNumber(split.amount)
        userGroup.total += amount

        const groupId = expense.group_id
        const group = userGroup.groups.get(groupId) ?? {
            groupId,
            groupName: groupNameById.get(groupId) ?? '未命名群組',
            splitAmount: 0,
            settledAmount: 0,
            unsettledAmount: 0
        }

        group.splitAmount += amount
        if (split.is_settled === true) {
            group.settledAmount += amount
        } else {
            group.unsettledAmount += amount
        }

        userGroup.groups.set(groupId, group)
        groupSplitByUser.set(split.user_id, userGroup)
    }

    const summary = new Map<string, {
        personalTotal: number
        personalCount: number
        byCategory: Map<string, number>
        groupSplitTotal: number
        groupRows: Map<string, {
            groupId: string
            groupName: string
            splitAmount: number
            settledAmount: number
            unsettledAmount: number
        }>
    }>()

    for (const userId of activeUsers) {
        summary.set(userId, {
            personalTotal: personalTotalByUser.get(userId) ?? 0,
            personalCount: personalCountByUser.get(userId) ?? 0,
            byCategory: byCategoryByUser.get(userId) ?? new Map<string, number>(),
            groupSplitTotal: groupSplitByUser.get(userId)?.total ?? 0,
            groupRows: groupSplitByUser.get(userId)?.groups ?? new Map<string, {
                groupId: string
                groupName: string
                splitAmount: number
                settledAmount: number
                unsettledAmount: number
            }>()
        })
    }

    return summary
}

function buildReportPayloads(
    reportMonth: string,
    summary: Map<string, {
        personalTotal: number
        personalCount: number
        byCategory: Map<string, number>
        groupSplitTotal: number
        groupRows: Map<string, {
            groupId: string
            groupName: string
            splitAmount: number
            settledAmount: number
            unsettledAmount: number
        }>
    }>,
    prevSummary: Map<string, { total: number }>,
    reportUserIds: Iterable<string>,
    generatedAt: string
): Map<string, MonthlyReportPayload> {
    const result = new Map<string, MonthlyReportPayload>()

    for (const userId of reportUserIds) {
        const row = summary.get(userId)
        const byCategory = row
            ? Array.from(row.byCategory.entries())
                .map(([category, amount]) => ({ category, amount }))
                .sort((lhs, rhs) => rhs.amount - lhs.amount)
            : []

        const groups = row
            ? Array.from(row.groupRows.values())
                .map((group) => ({
                    groupId: group.groupId,
                    groupName: group.groupName,
                    splitAmount: group.splitAmount,
                    settledAmount: group.settledAmount,
                    unsettledAmount: group.unsettledAmount
                }))
                .sort((lhs, rhs) => rhs.splitAmount - lhs.splitAmount)
            : []

        const personalTotal = row?.personalTotal ?? 0
        const personalCount = row?.personalCount ?? 0
        const splitTotal = row?.groupSplitTotal ?? 0
        const currentTotal = personalTotal + splitTotal
        const prevTotal = prevSummary.get(userId)?.total ?? 0
        const delta = currentTotal - prevTotal

        result.set(userId, {
            yearMonth: reportMonth,
            personal: {
                total: personalTotal,
                expenseCount: personalCount,
                byCategory
            },
            group: {
                splitTotal,
                groups
            },
            mom: {
                prevTotal,
                delta,
                deltaPct: prevTotal === 0 ? null : (delta / prevTotal) * 100
            },
            generatedAt
        })
    }

    return result
}

async function fetchExistingReportUserIds(
    supabase: SupabaseReadClient,
    reportMonth: string
): Promise<string[]> {
    const rows = await fetchAllPages<{ user_id: string }>((from, to) => supabase
        .from('monthly_reports')
        .select('user_id')
        .eq('year_month', reportMonth)
        .order('user_id')
        .range(from, to))

    return rows.map((row) => row.user_id)
}

type SupabaseReadClient = {
    from: (table: string) => any
}

async function fetchMonthData(
    supabase: SupabaseReadClient,
    reportMonth: string
): Promise<{ expenses: ExpenseRow[]; splits: ExpenseSplitRow[]; expenseById: Map<string, ExpenseRow>; groupNameById: Map<string, string> }> {
    const { startDate, endDate } = getMonthRange(reportMonth)

    const expenses = await fetchAllPages<ExpenseRow>((from, to) => supabase
        .from('expenses')
        .select('id, group_id, amount, category, paid_by')
        .gte('date', startDate)
        .lt('date', endDate)
        .order('id')
        .range(from, to))

    const expenseById = new Map<string, ExpenseRow>()
    for (const expense of expenses) {
        expenseById.set(expense.id, expense)
    }

    let splits: ExpenseSplitRow[] = []
    const expenseIds = expenses.map((expense) => expense.id)
    if (expenseIds.length > 0) {
        const expenseIdChunks = chunkArray(expenseIds, IN_CLAUSE_CHUNK_SIZE)
        for (const expenseIdsChunk of expenseIdChunks) {
            const splitRows = await fetchAllPages<ExpenseSplitRow>((from, to) => supabase
                .from('expense_splits')
                .select('expense_id, user_id, amount, is_settled')
                .in('expense_id', expenseIdsChunk)
                // offset 分頁必須用唯一序：expense_id 非唯一（同支出多列 split），tie 跨頁時
                // SQL 不保證穩定順序會漏列/重複列；(expense_id, user_id) 有 UNIQUE 約束，足為全序。
                .order('expense_id')
                .order('user_id')
                .range(from, to))
            splits.push(...splitRows)
        }
    }

    const groupIds = new Set<string>()
    for (const split of splits) {
        const expense = expenseById.get(split.expense_id)
        if (!expense || !expense.group_id) {
            continue
        }
        groupIds.add(expense.group_id)
    }

    const groupNameById = new Map<string, string>()
    const groupIdChunks = chunkArray(Array.from(groupIds), IN_CLAUSE_CHUNK_SIZE)
    for (const groupIdChunk of groupIdChunks) {
        const groupRows = await fetchAllPages<{ id: string; name: string }>((from, to) => supabase
            .from('groups')
            .select('id, name')
            .in('id', groupIdChunk)
            .order('id')
            .range(from, to))

        for (const group of groupRows) {
            groupNameById.set(group.id, group.name)
        }
    }

    return { expenses, splits, expenseById, groupNameById }
}

async function fetchPendingReportUserIds(
    supabase: SupabaseReadClient,
    reportMonth: string,
    userIds: string[]
): Promise<string[]> {
    if (userIds.length === 0) {
        return []
    }

    const rows: { user_id: string }[] = []
    const userIdChunks = chunkArray(userIds, IN_CLAUSE_CHUNK_SIZE)
    for (const userIdChunk of userIdChunks) {
        const chunkRows = await fetchAllPages<{ user_id: string }>((from, to) => supabase
            .from('monthly_reports')
            .select('user_id')
            .eq('year_month', reportMonth)
            .is('notified_at', null)
            .in('user_id', userIdChunk)
            .order('user_id')
            .range(from, to))
        rows.push(...chunkRows)
    }

    return rows.map((row) => row.user_id)
}

async function sendMonthlyPush(
    supabaseUrl: string,
    supabaseServiceKey: string,
    webhookSecret: string | undefined,
    payload: SendPushPayload
): Promise<boolean> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
    }

    if (webhookSecret) {
        headers['x-webhook-secret'] = webhookSecret
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    })

    if (response.status < HTTP_OK_MIN || response.status > HTTP_OK_MAX) {
        const text = await response.text().catch(() => '')
        throw new Error(`send-push failed (${response.status}) ${text}`)
    }

    const text = await response.text().catch(() => '')
    const pushResult = text
        ? (JSON.parse(text) as SendPushResponse)
        : ({ sent: 0, failed: 0, unregisteredRemoved: 0, skippedByPrefs: 0 } as SendPushResponse)
    const sent = pushResult.sent
    const failed = pushResult.failed

    // sent=0 且 failed>0 表示僅有失敗設備，保留 notified_at=NULL 供重試；否則標為已通知（含 sent=0,failed=0）
    return !(sent === 0 && failed > 0)
}

Deno.serve(async (req: Request) => {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const webhookSecret = Deno.env.get('SEND_PUSH_WEBHOOK_SECRET')

        if (!supabaseUrl || !supabaseServiceKey) {
            return new Response(
                JSON.stringify({ error: 'Missing environment variables' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }

        if (!isAuthorized(req, supabaseServiceKey)) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
        }

        const parsedBody = await req.json().catch(() => null)
        if (!isValidRequestBody(parsedBody)) {
            return new Response(
                JSON.stringify({ error: 'Invalid payload: yearMonth must be YYYY-MM' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        const body = (parsedBody ?? {}) as { yearMonth?: string }
        const yearMonth = body.yearMonth || getTaipeiPreviousMonthLabel()

        const now = new Date()
        const generatedAt = now.toISOString()
        const previousMonth = getPreviousYearMonth(yearMonth)

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            db: { schema: 'group_expense' }
        })

        const currentMonthData = await fetchMonthData(supabase, yearMonth)

        const previousMonthData = await fetchMonthData(supabase, previousMonth)

        const currentSummary = buildMonthSummary(
            currentMonthData.expenses,
            currentMonthData.splits,
            currentMonthData.expenseById,
            currentMonthData.groupNameById
        )

        const prevTotals = buildMonthSummary(
            previousMonthData.expenses,
            previousMonthData.splits,
            previousMonthData.expenseById,
            previousMonthData.groupNameById
        )

        const prevTotalMap = new Map<string, { total: number }>()
        for (const [userId, row] of prevTotals.entries()) {
            prevTotalMap.set(userId, { total: row.personalTotal + row.groupSplitTotal })
        }

        const existingReportUserIds = await fetchExistingReportUserIds(supabase, yearMonth)
        const reportUserIds = new Set<string>()
        for (const userId of currentSummary.keys()) {
            reportUserIds.add(userId)
        }
        for (const userId of prevTotalMap.keys()) {
            reportUserIds.add(userId)
        }
        for (const userId of existingReportUserIds) {
            reportUserIds.add(userId)
        }

        const reportPayloadByUser = buildReportPayloads(
            yearMonth,
            currentSummary,
            prevTotalMap,
            reportUserIds,
            generatedAt
        )
        const usersProcessed = reportPayloadByUser.size

        const upsertRows = Array.from(reportPayloadByUser.entries()).map(([userId, report]) => ({
            user_id: userId,
            year_month: yearMonth,
            data: report
        }))

        if (upsertRows.length > 0) {
            const { error } = await supabase
                .from('monthly_reports')
                .upsert(upsertRows, { onConflict: 'user_id,year_month' })

            if (error) {
                throw new Error(`upsert monthly_reports failed: ${error.message}`)
            }
        }

        let pushed = 0
        if (reportPayloadByUser.size > 0) {
            const pendingUserIds = await fetchPendingReportUserIds(
                supabase,
                yearMonth,
                Array.from(reportUserIds)
            )

            const pendingList = pendingUserIds.map((userId) => ({ user_id: userId }))
            for (const pending of pendingList) {
                const report = reportPayloadByUser.get(pending.user_id)
                if (!report) {
                    continue
                }

                const monthNumber = getMonthNumber(yearMonth)
                const total = extractReportTotal(report)

                try {
                    const shouldMarkNotified = await sendMonthlyPush(supabaseUrl, supabaseServiceKey, webhookSecret, {
                        userIds: [pending.user_id],
                        event: 'monthly_report',
                        title: `你的${monthNumber}月月報出爐`,
                        body: `${monthNumber}月共支出 NT ${Math.round(total)}，點開看完整報告`,
                        data: { url: `reports/${yearMonth}` }
                    })

                    if (!shouldMarkNotified) {
                        continue
                    }

                    const { error: updateError } = await supabase
                        .from('monthly_reports')
                        .update({ notified_at: now.toISOString() })
                        .eq('user_id', pending.user_id)
                        .eq('year_month', yearMonth)

                    if (updateError) {
                        console.error('notified_at update failed:', updateError)
                        continue
                    }

                    pushed += 1
                } catch (err) {
                    console.error('send-push failed for user:', pending.user_id, err)
                }
            }
        }

        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
        const {
            count: devicesPruned,
            error: pruneError
        } = await supabase
            .from('user_devices')
            .delete({ count: 'exact' })
            .lt('last_seen_at', cutoff)

        if (pruneError) {
            throw new Error(`prune stale devices failed: ${pruneError.message}`)
        }

        return new Response(
            JSON.stringify({
                yearMonth,
                usersProcessed,
                reportsUpserted: usersProcessed,
                pushed,
                devicesPruned: devicesPruned ?? 0
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('Unexpected error:', message)
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
})
