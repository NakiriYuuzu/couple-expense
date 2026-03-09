import {createPinia} from 'pinia'
import persist from 'pinia-plugin-persistedstate'

// Feature stores
export * from '@/features/expense/stores/expense'
export * from '@/features/auth/stores/auth'
export * from '@/features/family/stores/family'

// Shared stores
export * from '@/shared/stores/locale'
export * from '@/shared/stores/theme'

const pinia = createPinia()
pinia.use(persist)

export default pinia
