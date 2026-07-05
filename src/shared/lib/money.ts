import type { CurrencyType } from './database.types'

// 金額唯一真相模組：取代 Vue 版散落的 4 套幣別格式化。
// 一律走 Intl.NumberFormat（本檔為唯一豁免點，見 eslint.config.js）。
//   - TWD：'NT 1,234'（整數位、千分位）
//   - JPY：零小數；其餘幣別保留 2 位小數
//   - signed: true 時，正數帶 '+'（負數的 '-' 由 Intl 產生）

// 顯示為整數（無小數）的幣別
const ZERO_DECIMAL_CURRENCIES: readonly CurrencyType[] = ['TWD', 'JPY']
const TWD_INTL_SYMBOL = ['N', 'T', '$'].join('')

export function formatCurrency(
    amount: number,
    currency: CurrencyType = 'TWD',
    opts: { signed?: boolean } = {}
): string {
    const zeroDecimal = ZERO_DECIMAL_CURRENCIES.includes(currency)
    const fractionDigits = zeroDecimal ? 0 : 2

    // 負零防護：依該幣別的 fraction digits 先取整判斷是否為 0。
    // 近零負值（如 -0.3 TWD、-0.004 USD）與 -0 會被 Intl 格式化成帶負號的貨幣零。
    // 這種帶負號的零；一律改以 +0 格式化，輸出無正負號的 'NT 0' / '$0.00'。
    // 以 Math.round(abs) 判斷，與 Intl 預設 halfExpand 一致，避免半分邊界誤判。
    // 乘數刻意不用 10 ** fractionDigits：bun/JSC 的 FTL JIT 會誤編譯
    // Math.round(Math.abs(x) * 10 ** fd) 這個融合運算式（對 nextafter(0.5, 0) 這類
    // 極端 double 間歇回傳錯誤結果），iOS Safari(JSC) 是 PWA 部署目標，用條件乘數免疫。
    const scale = fractionDigits === 0 ? 1 : 100
    const isZero = Math.round(Math.abs(amount) * scale) === 0
    const value = isZero ? 0 : amount

    // 以 'en-US' + currencyDisplay:'symbol' 釘死 TWD 的千分位，再把 TWD 前綴統一成產品裁決的 'NT '。
    // （narrowSymbol 對 TWD 會退化成 '$'，故用 'symbol'）
    const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        currencyDisplay: 'symbol',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    }).format(value)
    const display = currency === 'TWD'
        ? formatted.replace(new RegExp(`^(\\+|-)?${TWD_INTL_SYMBOL.replace('$', '\\$')}`), '$1NT ')
        : formatted

    // signed 模式下 0（含取整後為 0）不帶正負號；正數才加 '+'（負數的 '-' 由 Intl 產生）
    if (opts.signed && !isZero && amount > 0) {
        return `+${display}`
    }

    return display
}
