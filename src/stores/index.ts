import {createPinia} from 'pinia'
import persist from 'pinia-plugin-persistedstate'
// 記得在這邊加入你的 store
export * from './expense'
export * from './locale'
export * from './auth'
export * from './couple'
export * from './theme'
export { useNotificationStore, type NotificationHistory } from './notification'

const pinia = createPinia()
pinia.use(persist)

export default pinia
