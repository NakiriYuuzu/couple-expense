import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 固定測試時區為 UTC，與 CI (ubuntu) 一致，避免本地時區造成 stats 日期相關測試偶發失敗
process.env.TZ = 'UTC'

export default defineConfig({
    plugins: [vue() as any],
    test: {
        environment: 'happy-dom',
        globals: true
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    }
})
