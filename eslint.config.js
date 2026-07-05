import tseslint from 'typescript-eslint'

// ─── 機制化禁令（Phase 2）───────────────────────────────────────────────
// 目的：把「時間格式不一致」「金額格式散落」在 lint 層釘死，強制走唯一真相模組。

// 禁 toISOString().slice(...) 式的日期/月份擷取（裝置時區 bug 溫床）
const banToISOStringSlice = {
    selector:
        "CallExpression[callee.property.name='slice'][callee.object.type='CallExpression'][callee.object.callee.property.name='toISOString']",
    message:
        '禁止用 toISOString().slice() 擷取日期/月份；請改用 @/shared/lib/datetime.ts（taipeiDateString / currentYearMonth / monthRangeUtc / weekStart）以 Asia/Taipei 分桶。'
}

const legacyTwdPrefixPattern = ['N', 'T', '\\$'].join('')

// 禁字串字面值中的舊 TWD 前綴
const banNtDollarLiteral = {
    selector: `Literal[value=/${legacyTwdPrefixPattern}/]`,
    message:
        '禁止硬編碼舊 TWD 前綴；金額顯示一律走 @/shared/lib/money.ts 的 formatCurrency（本檔為唯一豁免點）。'
}

// 禁 template literal 中的舊 TWD 前綴
const banNtDollarTemplate = {
    selector: `TemplateElement[value.raw=/${legacyTwdPrefixPattern}/]`,
    message:
        '禁止在 template literal 中硬編碼舊 TWD 前綴；金額顯示一律走 @/shared/lib/money.ts 的 formatCurrency。'
}

// 禁 money.ts 以外裸用 new Intl.NumberFormat
const banIntlNumberFormat = {
    selector: "NewExpression[callee.object.name='Intl'][callee.property.name='NumberFormat']",
    message:
        '禁止在 @/shared/lib/money.ts 之外直接 new Intl.NumberFormat；金額格式化一律走 formatCurrency。'
}

// 禁 money.ts 以外裸呼叫 Intl.NumberFormat(...)（不加 new 也攔）
const banIntlNumberFormatCall = {
    selector: "CallExpression[callee.object.name='Intl'][callee.property.name='NumberFormat']",
    message:
        '禁止在 @/shared/lib/money.ts 之外直接呼叫 Intl.NumberFormat；金額格式化一律走 formatCurrency。'
}

export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'src/routeTree.gen.ts', '.tanstack/**']
    },

    // typescript-eslint 推薦規則（非型別感知，快速）
    ...tseslint.configs.recommended,

    // 全域禁令 + 對 generated/infra 型別務實放寬
    {
        files: ['src/**/*.{ts,tsx}'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'no-restricted-syntax': [
                'error',
                banToISOStringSlice,
                banNtDollarLiteral,
                banNtDollarTemplate,
                banIntlNumberFormat,
                banIntlNumberFormatCall
            ]
        }
    },

    // money 模組本身與測試：豁免舊 TWD 前綴與 Intl.NumberFormat（仍保留 toISOString 禁令）
    {
        files: ['src/shared/lib/money.ts', 'src/shared/lib/__tests__/money.spec.ts'],
        rules: {
            'no-restricted-syntax': ['error', banToISOStringSlice]
        }
    },

    // i18n locale 資料檔：歷史上允許靜態 UI 文案標示幣別軸，
    // 目前仍保留翻譯內容豁免（保留 toISOString / Intl 禁令）。
    {
        files: ['src/shared/i18n/locales/**'],
        rules: {
            'no-restricted-syntax': [
                'error',
                banToISOStringSlice,
                banIntlNumberFormat,
                banIntlNumberFormatCall
            ]
        }
    },

    // shadcn 生成碼：只關閉生成碼噪音規則，機制化禁令（舊 TWD 前綴 / Intl / toISOString）仍全數保留，
    // 否則 ui/ 會成為繞過金額與時間唯一真相模組的破口。
    {
        files: ['src/components/ui/**'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            'no-restricted-syntax': [
                'error',
                banToISOStringSlice,
                banNtDollarLiteral,
                banNtDollarTemplate,
                banIntlNumberFormat,
                banIntlNumberFormatCall
            ]
        }
    }
]
