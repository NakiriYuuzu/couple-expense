export * from './extensions/datetime'

/**
 * 格式化金額為「NT$ 1,234」格式（四捨五入至整數，含千分位）
 */
export const formatAmount = (amount: number): string => {
    return `NT$ ${Math.round(amount).toLocaleString()}`
}
