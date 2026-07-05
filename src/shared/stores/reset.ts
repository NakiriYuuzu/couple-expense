// 登出清理的「一處清光」註冊表：各 store 於模組載入時登記自己的 reset()，
// SIGNED_OUT 時 authStore 只呼叫 resetAllStores() 一次，不再逐 store 手工清理
// （修 Vue 版 App.vue / auth.ts 散落式清理造成的跨帳號殘留）。

type Resetter = () => void

const resetters = new Set<Resetter>()

export function registerResettable(fn: Resetter): void {
    resetters.add(fn)
}

export function resetAllStores(): void {
    for (const fn of resetters) fn()
}
