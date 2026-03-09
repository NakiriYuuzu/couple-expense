import './styles/main.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from '@/app/router'
import pinia from '@/shared/stores'
import i18n from '@/shared/i18n'

const app = createApp(App)

app.use(router)
app.use(pinia)
app.use(i18n)

app.mount('#app')
