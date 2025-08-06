const en = {
  // Common
  common: {
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    loading: 'Loading...',
    noData: 'No Data',
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info'
  },

  // Navigation
  nav: {
    home: 'Home',
    statistics: 'Statistics',
    search: 'Search',
    settings: 'Settings'
  },

  // Home
  home: {
    title: 'Couple Expense',
    monthlyExpense: 'Monthly Expense',
    addExpense: 'Add Expense',
    recentExpenses: 'Recent Expenses',
    noExpenses: 'No expense records',
    balance: 'Balance',
    totalSpent: 'Total Spent',
    remainingBalance: 'Remaining Balance',
    budgetExceeded: 'Budget Exceeded',
    insufficientBalance: 'Insufficient Balance',
    recentSpending: 'Recent Spending',
    setBalance: 'Set Balance',
    setBalanceDesc: 'Enter the new balance amount. Current balance is',
    remainingBalanceDesc: 'Balance after deducting this month\'s total expenses',
    editExpense: 'Edit Expense',
    editExpenseDesc: 'Edit the details of this transaction',
    title_: 'Title',
    amount: 'Amount',
    category: 'Category',
    date: 'Date',
    enterNewBalance: 'Enter new balance',
    enterExpenseTitle: 'Enter expense title',
    enterAmount: 'Enter amount',
    selectDate: 'Select date'
  },

  // Statistics
  stats: {
    title: 'Statistics',
    calendarView: 'Calendar View',
    chartAnalysis: 'Chart Analysis',
    monthlyTotal: 'Monthly Total',
    expenseCount: 'Expense Count',
    todayExpense: 'Today\'s Expense',
    dailyAverage: 'Daily Average',
    byMonth: 'By Month',
    byYear: 'By Year',
    totalExpense: 'Total Expense',
    transactionCount: 'Transaction Count',
    count: 'transactions',
    expenseDistribution: 'Expense Distribution',
    categoryPercentage: 'Category percentage breakdown',
    noData: 'No data',
    expenseRanking: 'Expense Ranking',
    categoryAmountComparison: 'Category amount comparison',
    dailyTrend: 'Daily Expense Trend',
    dailyChangePattern: 'Daily expense changes',
    detailedStats: 'Detailed Statistics',
    year: 'Year',
    expenseAmount: 'Expense Amount',
    day: 'Day',
    dailyExpense: 'Daily Expense',
    selectMonth: 'Select Month',
    selectYear: 'Select Year',
    months: {
      january: 'January',
      february: 'February',
      march: 'March',
      april: 'April',
      may: 'May',
      june: 'June',
      july: 'July',
      august: 'August',
      september: 'September',
      october: 'October',
      november: 'November',
      december: 'December'
    }
  },

  // Expense
  expense: {
    title: 'Expense Item',
    titlePlaceholder: 'e.g. Lunch, Coffee, Shopping...',
    amount: 'Amount',
    category: 'Category',
    description: 'Description',
    date: 'Date',
    payer: 'Payer',
    addExpense: 'Add Expense',
    addExpenseDesc: 'Fill out the form below to add a new expense record',
    editExpense: 'Edit Expense',
    deleteExpense: 'Delete Expense',
    expenseAdded: 'Expense record added',
    expenseUpdated: 'Expense record updated',
    expenseDeleted: 'Expense record deleted',
    categories: {
      food: 'Food & Dining',
      pet: 'Pet',
      shopping: 'Shopping',
      transport: 'Transportation',
      home: 'Home',
      other: 'Other'
    }
  },

  // Search
  search: {
    title: 'Search',
    placeholder: 'Search expense records...',
    searchTransaction: 'Search transactions...',
    noResults: 'No matching records found',
    noResultsFound: 'No related transactions found',
    enterKeywordToSearch: 'Enter keyword to start searching',
    filterBy: 'Filter by',
    filterConditions: 'Filter Conditions',
    setFilterDesc: 'Set filter conditions to find specific transactions',
    dateRange: 'Date Range',
    startDate: 'Start Date',
    endDate: 'End Date',
    category: 'Category',
    amount: 'Amount',
    minAmount: 'Min Amount',
    maxAmount: 'Max Amount',
    amountRange: 'Amount Range',
    reset: 'Reset',
    applyFilter: 'Apply Filter',
    minAmountPlaceholder: 'Min amount',
    maxAmountPlaceholder: 'Max amount'
  },

  // Settings
  settings: {
    title: 'Settings',
    theme: 'Theme',
    themeDesc: 'Switch between dark and light mode',
    language: 'Language',
    languageDesc: 'Choose display language',
    notifications: 'Notifications',
    notificationsDesc: 'Receive expense reminder notifications',
    moreSettings: 'More Settings',
    account: 'Account Settings',
    accountDesc: 'Manage your account information',
    about: 'About',
    version: 'Version 1.0.0',
    languages: {
      'zh-TW': '繁體中文',
      'zh-CN': '简体中文',
      'en': 'English',
      'ja': '日本語'
    },
    // Account management
    logout: 'Logout',
    switchAccount: 'Switch Account',
    logoutConfirmTitle: 'Confirm Logout',
    logoutConfirmDesc: 'Are you sure you want to logout? You will need to login again to use the app.',
    confirmLogout: 'Confirm Logout',
    logoutSuccess: 'Successfully logged out',
    logoutError: 'Logout failed, please try again',
    switchAccountSuccess: 'Account switched successfully',
    switchAccountError: 'Account switch failed, please try again',
    manageAccounts: 'Manage Accounts',
    current: 'Current',
    addAccountWithGoogle: 'Add Account with Google',
    addAccountInfo: 'Please select the Google account you want to add',
    addAccountError: 'Failed to add account, please try again',
    accountRemoved: 'Account removed',
    cannotRemoveCurrentAccount: 'Cannot remove the current account'
  },

  // Validation messages
  validation: {
    required: 'This field is required',
    minLength: 'Minimum {min} characters required',
    maxLength: 'Maximum {max} characters allowed',
    email: 'Please enter a valid email address',
    number: 'Please enter a valid number',
    positiveNumber: 'Please enter a number greater than 0'
  },

  // Error messages
  errors: {
    networkError: 'Network connection error',
    serverError: 'Server error',
    unknownError: 'Unknown error',
    dataNotFound: 'Data not found',
    permissionDenied: 'Permission denied'
  },

  // Couple Settings
  couple: {
    title: 'Couple Settings',
    createOrJoin: 'Create or Join Couple',
    manageSharedExpenses: 'Manage shared expenses with your partner',
    createNew: 'Create New Couple',
    createDesc: 'Create a new shared expense space',
    join: 'Join Couple',
    joinDesc: 'Use invitation code to join your partner\'s expense space',
    coupleName: 'Couple Name',
    coupleNamePlaceholder: 'Enter couple name (e.g. Our Home)',
    invitationCode: 'Invitation Code',
    invitationCodePlaceholder: 'Enter invitation code',
    create: 'Create Couple',
    joinButton: 'Join Couple',
    admin: 'Admin',
    shareCode: 'Share this invitation code with your partner',
    partnerStatus: 'Partner Status',
    joined: 'Joined',
    waitingForPartner: 'Waiting for partner to join',
    budgetSettings: 'Budget Settings',
    monthlyBudget: 'Monthly Budget',
    budgetStartDay: 'Budget Start Day',
    selectDate: 'Select date',
    dayOfMonth: 'Day {day} of month',
    categoryBudgetAllocation: 'Category Budget Allocation',
    total: 'Total',
    reset: 'Reset',
    saveSettings: 'Save Settings',
    dangerZone: 'Danger Zone',
    leaveCouple: 'Leave Couple',
    leaveWarning: 'Leaving the couple will:',
    leaveWarning1: 'You will not be able to view your partner\'s expenses',
    leaveWarning2: 'Your expenses will be kept but no longer shared',
    leaveWarning3: 'If you are admin, you need to transfer admin rights first',
    confirmLeave: 'Are you sure you want to leave the couple? This action cannot be undone.',
    error: 'Error',
    clearError: 'Clear Error',
    loading: 'Loading invitation code...',
    
    // Success and error messages
    createSuccess: 'Successfully created couple! Invitation code: {code}',
    createError: 'Failed to create, please try again',
    joinSuccess: 'Successfully joined couple!',
    joinError: 'Failed to join, please check if invitation code is correct',
    copySuccess: 'Invitation code copied to clipboard',
    copyError: 'Failed to copy',
    saveSuccess: 'Budget settings saved',
    saveError: 'Failed to save, please try again',
    leaveSuccess: 'Left couple',
    leaveError: 'Failed to leave, please try again'
  }
}
export default en
