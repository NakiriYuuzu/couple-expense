export interface ByCategoryEntry {
    category: string
    amount: number
}

export interface PersonalReportSection {
    total: number
    expenseCount: number
    byCategory: ByCategoryEntry[]
}

export interface GroupReportEntry {
    groupId: string
    groupName: string
    splitAmount: number
    settledAmount: number
    unsettledAmount: number
}

export interface GroupReportSection {
    splitTotal: number
    groups: GroupReportEntry[]
}

export interface MomComparison {
    prevTotal: number
    delta: number
    deltaPct: number | null
}

export interface MonthlyReportData {
    yearMonth: string
    personal: PersonalReportSection
    group: GroupReportSection
    mom: MomComparison
    generatedAt: string
}
