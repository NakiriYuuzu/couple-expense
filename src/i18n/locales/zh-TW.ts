const zhTW = {
  // 通用
  common: {
    confirm: '確認',
    cancel: '取消',
    save: '儲存',
    delete: '刪除',
    edit: '編輯',
    add: '新增',
    search: '搜尋',
    loading: '載入中...',
    noData: '暂無資料',
    success: '成功',
    error: '錯誤',
    warning: '警告',
    info: '資訊'
  },

  // 導航
  nav: {
    home: '首頁',
    statistics: '統計分析',
    search: '搜尋',
    settings: '設定'
  },

  // 首頁
  home: {
    title: '情侶記帳',
    monthlyExpense: '本月消費',
    addExpense: '新增消費',
    recentExpenses: '最近消費',
    noExpenses: '暫無消費記錄',
    balance: '餘額',
    totalSpent: '總花費',
    remainingBalance: '剩餘餘額',
    budgetExceeded: '預算超支',
    insufficientBalance: '餘額不足',
    recentSpending: '最近消費',
    setBalance: '設定餘額',
    setBalanceDesc: '請輸入新的餘額金額。當前餘額為',
    remainingBalanceDesc: '餘額扣除本月總花費後的剩餘金額',
    editExpense: '編輯費用',
    editExpenseDesc: '修改此筆交易的詳細資訊',
    title_: '標題',
    amount: '金額',
    category: '類別',
    date: '日期',
    enterNewBalance: '輸入新的餘額',
    enterExpenseTitle: '輸入費用標題',
    enterAmount: '輸入金額',
    selectDate: '選擇日期'
  },

  // 統計分析
  stats: {
    title: '統計分析',
    calendarView: '日曆檢視',
    chartAnalysis: '圖表分析',
    monthlyTotal: '月總消費',
    expenseCount: '消費筆數',
    todayExpense: '今日消費',
    dailyAverage: '平均每日',
    byMonth: '按月',
    byYear: '按年',
    totalExpense: '總消費',
    transactionCount: '消費筆數',
    count: '筆',
    expenseDistribution: '消費分布',
    categoryPercentage: '各類別消費占比',
    noData: '暫無數據',
    expenseRanking: '消費排行',
    categoryAmountComparison: '各類別消費金額比較',
    dailyTrend: '每日消費趨勢',
    dailyChangePattern: '每日消費變化',
    detailedStats: '詳細統計',
    year: '年',
    expenseAmount: '消費金額',
    day: '日',
    dailyExpense: '每日消費',
    selectMonth: '選擇月份',
    selectYear: '選擇年份',
    months: {
      january: '一月',
      february: '二月',
      march: '三月',
      april: '四月',
      may: '五月',
      june: '六月',
      july: '七月',
      august: '八月',
      september: '九月',
      october: '十月',
      november: '十一月',
      december: '十二月'
    }
  },

  // 消費相關
  expense: {
    title: '費用項目',
    titlePlaceholder: '例如：午餐、咖啡、購物...',
    amount: '金額',
    category: '類別',
    description: '說明',
    date: '日期',
    payer: '付款人',
    addExpense: '新增費用',
    addExpenseDesc: '填寫下方表單來新增一筆費用記錄',
    editExpense: '編輯消費',
    deleteExpense: '刪除消費',
    expenseAdded: '消費記錄已新增',
    expenseUpdated: '消費記錄已更新',
    expenseDeleted: '消費記錄已刪除',
    categories: {
      food: '餐飲',
      pet: '寵物',
      shopping: '購物',
      transport: '交通',
      home: '居家',
      other: '其他'
    }
  },

  // 搜尋
  search: {
    title: '搜尋',
    placeholder: '搜尋消費記錄...',
    searchTransaction: '搜尋交易...',
    noResults: '找不到符合條件的記錄',
    noResultsFound: '沒有找到相關的交易',
    enterKeywordToSearch: '輸入關鍵字開始搜尋',
    filterBy: '篩選條件',
    filterConditions: '篩選條件',
    setFilterDesc: '設定篩選條件來精確查找交易記錄',
    dateRange: '日期範圍',
    startDate: '開始日期',
    endDate: '結束日期',
    category: '類別',
    amount: '金額',
    minAmount: '最低金額',
    maxAmount: '最高金額',
    amountRange: '金額範圍',
    reset: '重設',
    applyFilter: '套用篩選',
    minAmountPlaceholder: '最小金額',
    maxAmountPlaceholder: '最大金額'
  },

  // 設定
  settings: {
    title: '設定',
    theme: '主題',
    themeDesc: '切換深色或淺色模式',
    language: '語言',
    languageDesc: '選擇顯示語言',
    notifications: '通知',
    notificationsDesc: '接收消費提醒通知',
    moreSettings: '更多設定',
    account: '帳戶設定',
    accountDesc: '管理您的帳戶資訊',
    about: '關於',
    version: '版本 1.0.0',
    languages: {
      'zh-TW': '繁體中文',
      'zh-CN': '简体中文',
      'en': 'English',
      'ja': '日本語'
    },
    // 帳戶管理
    logout: '登出',
    switchAccount: '切換帳號',
    logoutConfirmTitle: '確認登出',
    logoutConfirmDesc: '您確定要登出嗎？登出後需要重新登入才能使用。',
    confirmLogout: '確認登出',
    switchAccountTitle: '切換帳號',
    switchAccountDesc: '您將登出目前帳號，並可以使用其他帳號重新登入。',
    confirmSwitch: '確認切換',
    logoutSuccess: '已成功登出',
    logoutError: '登出失敗，請稍後再試',
    switchAccountSuccess: '請使用新帳號登入',
    switchAccountError: '切換帳號失敗，請稍後再試'
  },

  // 驗證訊息
  validation: {
    required: '此欄位為必填',
    minLength: '最少需要 {min} 個字元',
    maxLength: '最多只能 {max} 個字元',
    email: '請輸入有效的電子郵件地址',
    number: '請輸入有效的數字',
    positiveNumber: '請輸入大於0的數字'
  },

  // 錯誤訊息
  errors: {
    networkError: '網路連線錯誤',
    serverError: '伺服器錯誤',
    unknownError: '未知錯誤',
    dataNotFound: '找不到資料',
    permissionDenied: '權限不足'
  },

  // 情侶設定
  couple: {
    title: '情侶設定',
    createOrJoin: '建立或加入情侶',
    manageSharedExpenses: '與您的伴侶一起管理共同開支',
    createNew: '創建新的情侶關係',
    createDesc: '建立新的共享記帳空間',
    join: '加入情侶關係',
    joinDesc: '使用邀請碼加入伴侶的記帳空間',
    coupleName: '情侶名稱',
    coupleNamePlaceholder: '輸入情侶名稱（例如：我們的家庭）',
    invitationCode: '邀請碼',
    invitationCodePlaceholder: '輸入邀請碼',
    create: '創建情侶關係',
    joinButton: '加入情侶關係',
    admin: '管理員',
    shareCode: '分享此邀請碼給您的伴侶',
    partnerStatus: '伴侶狀態',
    joined: '已加入',
    waitingForPartner: '等待伴侶加入',
    budgetSettings: '預算設定',
    monthlyBudget: '月度總預算',
    budgetStartDay: '預算開始日',
    selectDate: '選擇日期',
    dayOfMonth: '每月 {day} 日',
    categoryBudgetAllocation: '類別預算分配',
    total: '總計',
    reset: '重置',
    saveSettings: '儲存設定',
    dangerZone: '危險區域',
    leaveCouple: '離開情侶關係',
    leaveWarning: '離開情侶關係將會：',
    leaveWarning1: '您將無法查看伴侶的支出記錄',
    leaveWarning2: '您的支出記錄將保留但不再共享',
    leaveWarning3: '如果您是管理員，需要先轉移管理權',
    confirmLeave: '確定要離開情侶關係嗎？此操作無法撤銷。',
    error: '錯誤',
    clearError: '清除錯誤',
    loading: '載入邀請碼中...',
    
    // 成功和錯誤訊息
    createSuccess: '成功創建情侶關係！邀請碼：{code}',
    createError: '創建失敗，請稍後再試',
    joinSuccess: '成功加入情侶關係！',
    joinError: '加入失敗，請檢查邀請碼是否正確',
    copySuccess: '邀請碼已複製到剪貼板',
    copyError: '複製失敗',
    saveSuccess: '預算設定已儲存',
    saveError: '儲存失敗，請稍後再試',
    leaveSuccess: '已離開情侶關係',
    leaveError: '離開失敗，請稍後再試'
  }
}

export default zhTW