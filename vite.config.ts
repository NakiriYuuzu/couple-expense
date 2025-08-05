import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { env } from 'process'
import mkcert from 'vite-plugin-mkcert'
import os from 'os'
import fs from 'fs'
import path from 'path'
import child_process from 'child_process'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import removeConsole from 'vite-plugin-remove-console'

function setupHttpsConfig(): { useBuiltIn: boolean; config?: { key: Buffer; cert: Buffer } } {
	const isWindows = os.platform() === 'win32'
	if (!isWindows) return {useBuiltIn: true}

	const baseFolder = env.APPDATA ? `${env.APPDATA}/ASP.NET/https` : `${env.HOME}/.aspnet/https`
	const certName = 'gsweb.client'
	const certPath = path.join(baseFolder, `${certName}.pem`)
	const keyPath = path.join(baseFolder, `${certName}.key`)

	if (!fs.existsSync(baseFolder)) {
		fs.mkdirSync(baseFolder, {recursive: true})
	}

	if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
		const result = child_process.spawnSync('dotnet', [
			'dev-certs', 'https', '--export-path', certPath, '--format', 'Pem', '--no-password'
		], {stdio: 'inherit'})

		if (result.status !== 0) {
			console.warn('dotnet dev-certs failed, falling back to mkcert')
			return {useBuiltIn: true}
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

	return {useBuiltIn: true}
}

const httpsSetup = setupHttpsConfig()

// https://vite.dev/config/
export default defineConfig(({mode}) =>{
	const env = loadEnv(mode, process.cwd())
	return {
		base: env.VITE_APP_ROUTER_BASE || '/',
		plugins: [
			vue(),
            tailwindcss(),
			...(httpsSetup.useBuiltIn ? [mkcert()] : []),
            removeConsole(),
            VitePWA({
                injectRegister: 'auto',
                registerType: 'autoUpdate',
                manifest: {
                    name: '記帳App',
                    short_name: '記帳App',
                    description: '紀錄情侶的共同開支，讓愛情更甜蜜',
                    theme_color: '#8790DC',
                    background_color: '#e1e3ed',
                    orientation: 'portrait',
                    icons: [
                        {
                            src: `apple-touch-icon.png`,
                            sizes: '180x180',
                            type: 'image/png',
                            purpose: 'any'
                        },
                        {
                            src: `web-app-manifest-192x192.png`,
                            sizes: '192x192',
                            type: 'image/png'
                        },
                        {
                            src: `web-app-manifest-512x512.png`,
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'any'
                        }
                    ],
                    display: 'standalone',
                    start_url: '.',
                    scope: '.'
                },
                workbox: {
                    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                    runtimeCaching: [
                        {
                            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'google-fonts-cache',
                                expiration: {
                                    maxEntries: 10,
                                    maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                                }
                            }
                        }
                    ]
                },
                devOptions: {
                    enabled: true,
                    suppressWarnings: true,
                    type: 'module'
                },
            })
		],
		resolve: {
			alias: {
				'@': fileURLToPath(new URL('./src', import.meta.url)),
			}
		},
		server: {
			port: 5173,
			...(httpsSetup.useBuiltIn
					? {}
					: {https: httpsSetup.config}
			)
		},
		build: {
			manifest: false,
			outDir: `./dist/${mode}`,
		}
	}
})
