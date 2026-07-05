import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { env } from 'process'
import mkcert from 'vite-plugin-mkcert'
import os from 'os'
import fs from 'fs'
import path from 'path'
import child_process from 'child_process'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import removeConsole from 'vite-plugin-remove-console'

const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

function setupHttpsConfig(): { useBuiltIn: boolean; config?: { key: Buffer; cert: Buffer } } {
    const isWindows = os.platform() === 'win32'
    if (!isWindows) return { useBuiltIn: true }

    const baseFolder = env.APPDATA ? `${env.APPDATA}/ASP.NET/https` : `${env.HOME}/.aspnet/https`
    const certName = 'gsweb.client'
    const certPath = path.join(baseFolder, `${certName}.pem`)
    const keyPath = path.join(baseFolder, `${certName}.key`)

    if (!fs.existsSync(baseFolder)) {
        fs.mkdirSync(baseFolder, { recursive: true })
    }

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        const result = child_process.spawnSync('dotnet', [
            'dev-certs', 'https', '--export-path', certPath, '--format', 'Pem', '--no-password'
        ], { stdio: 'inherit' })

        if (result.status !== 0) {
            console.warn('dotnet dev-certs failed, falling back to mkcert')
            return { useBuiltIn: true }
        }
    }

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        return {
            useBuiltIn: false,
            config: {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath)
            }
        }
    }

    return { useBuiltIn: true }
}

const httpsSetup = setupHttpsConfig()

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd())
    return {
        base: env.VITE_APP_ROUTER_BASE || '/',
        define: {
            __APP_VERSION__: JSON.stringify(pkg.version)
        },
        plugins: [
            tanstackRouter({ target: 'react', autoCodeSplitting: true }),
            react(),
            // React Compiler 全程啟用。@vitejs/plugin-react v6 為 oxc-based，不再吃 babel.plugins，
            // 官方改以 reactCompilerPreset + @rolldown/plugin-babel 掛載 babel-plugin-react-compiler。
            babel({ presets: [reactCompilerPreset()] }),
            tailwindcss(),
            ...(httpsSetup.useBuiltIn ? [mkcert()] : []),
            removeConsole(),
            VitePWA({
                injectRegister: null,
                registerType: 'autoUpdate',
                strategies: 'injectManifest',
                srcDir: 'src',
                filename: 'sw.ts',
                manifest: {
                    name: '記帳App',
                    short_name: '記帳App',
                    description: '紀錄家庭的共同開支，讓生活更美好',
                    theme_color: '#7c5cc5',
                    background_color: '#f0eef5',
                    orientation: 'portrait',
                    display_override: ['window-controls-overlay', 'standalone'],
                    categories: ['finance', 'lifestyle'],
                    icons: [
                        {
                            src: 'apple-touch-icon.png',
                            sizes: '180x180',
                            type: 'image/png',
                            purpose: 'any'
                        },
                        {
                            src: 'web-app-manifest-192x192.png',
                            sizes: '192x192',
                            type: 'image/png',
                            purpose: 'any'
                        },
                        {
                            src: 'web-app-manifest-512x512.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'any'
                        },
                        {
                            src: 'web-app-manifest-512x512-maskable.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'maskable'
                        }
                    ],
                    display: 'standalone',
                    start_url: './',
                    scope: './'
                },
                // injectManifest 策略：runtimeCaching/navigateFallback 改在 src/sw.ts 手寫
                // （workbox 選項只給 generateSW 用，injectManifest 下這裡只留 precache manifest 範圍）。
                injectManifest: {
                    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
                },
                devOptions: {
                    enabled: true,
                    suppressWarnings: true,
                    type: 'module'
                }
            })
        ],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url))
            }
        },
        server: {
            port: 5173,
            ...(httpsSetup.useBuiltIn
                    ? {}
                    : { https: httpsSetup.config }
            )
        },
        build: {
                    manifest: false,
                    outDir: `./dist/${mode}`,
                    rolldownOptions: {
                        output: {
                            codeSplitting: {
                                includeDependenciesRecursively: false,
                                groups: [
                                    {
                                        name: 'react-vendor',
                                        test: /[\\/]node_modules[\\/](react|react-dom)([\\/]|$)/,
                                        minShareCount: 2
                                    },
                                    {
                                        name: 'charts',
                                        test: /[\\/]node_modules[\\/]recharts([\\/]|$)/,
                                        minShareCount: 2
                                    },
                                    {
                                        name: 'firebase',
                                        test: /[\\/]node_modules[\\/](firebase|@firebase)([\\/]|$)/,
                                        minShareCount: 2
                                    }
                                ]
                            }
                        }
                    }
        }
    }
})
