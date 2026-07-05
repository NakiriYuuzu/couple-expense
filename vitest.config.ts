import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 固定測試時區為 UTC，與 CI (ubuntu) 一致，避免本地時區造成 stats 日期相關測試偶發失敗
process.env.TZ = 'UTC'

const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

export default defineConfig({
    plugins: [react() as any],
    // 對齊 vite.config.ts 的 define，讓 App 內的 __APP_VERSION__ 在測試 runtime 也有值
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version)
    },
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./tests/setup.ts']
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    }
})
