const ensureFiniteAmount = (amount: number) => Number.isFinite(amount) ? amount : 0

const normalizeNegativeZero = (amount: number) => Object.is(amount, -0) ? 0 : amount

function distributeDifference(
    baseValues: number[],
    adjustments: Array<{ index: number; remainder: number }>,
    difference: number,
    step: 1 | -1
): number[] {
    if (difference === 0 || adjustments.length === 0) {
        return baseValues.map(normalizeNegativeZero)
    }

    const result = [...baseValues]
    const totalSteps = Math.abs(difference)

    for (let i = 0; i < totalSteps; i++) {
        const target = adjustments[i % adjustments.length]!
        result[target.index] = (result[target.index] ?? 0) + step
    }

    return result.map(normalizeNegativeZero)
}

export function normalizePositiveAmounts(
    amounts: number[],
    targetTotal = Math.round(amounts.reduce((sum, amount) => sum + Math.max(0, ensureFiniteAmount(amount)), 0))
): number[] {
    if (amounts.length === 0) return []

    const normalized = amounts.map((amount, index) => {
        const safeAmount = Math.max(0, ensureFiniteAmount(amount))
        const base = Math.floor(safeAmount)

        return {
            index,
            base,
            remainder: safeAmount - base
        }
    })

    const baseValues = normalized.map(item => item.base)
    const difference = targetTotal - baseValues.reduce((sum, amount) => sum + amount, 0)

    if (difference <= 0) {
        return baseValues.map(normalizeNegativeZero)
    }

    return distributeDifference(
        baseValues,
        [...normalized].sort((a, b) => b.remainder - a.remainder || a.index - b.index),
        difference,
        1
    )
}

export function normalizeNetBalances(amounts: number[]): number[] {
    if (amounts.length === 0) return []

    const positives = amounts
        .map((amount, index) => ({ index, amount: Math.max(0, ensureFiniteAmount(amount)) }))
        .filter(item => item.amount > 0)
    const negatives = amounts
        .map((amount, index) => ({ index, amount: Math.max(0, -ensureFiniteAmount(amount)) }))
        .filter(item => item.amount > 0)

    const positiveTotal = positives.reduce((sum, item) => sum + item.amount, 0)
    const negativeTotal = negatives.reduce((sum, item) => sum + item.amount, 0)
    const targetTotal = Math.round((positiveTotal + negativeTotal) / 2)

    const normalizedPositives = normalizePositiveAmounts(
        positives.map(item => item.amount),
        targetTotal
    )
    const normalizedNegatives = normalizePositiveAmounts(
        negatives.map(item => item.amount),
        targetTotal
    )

    const result = Array.from({ length: amounts.length }, () => 0)

    positives.forEach((item, index) => {
        result[item.index] = normalizedPositives[index] ?? 0
    })

    negatives.forEach((item, index) => {
        result[item.index] = -1 * (normalizedNegatives[index] ?? 0)
    })

    return result.map(normalizeNegativeZero)
}
