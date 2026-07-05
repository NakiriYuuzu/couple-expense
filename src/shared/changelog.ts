// 更新時請同步 CHANGELOG.md 與本檔。
export interface ChangelogItem {
    zhTW: string
    en: string
}

export interface ChangelogEntry {
    version: string
    date: string
    sections: {
        type: 'added' | 'changed' | 'fixed' | 'security'
        items: ChangelogItem[]
    }[]
}

export const changelog: ChangelogEntry[] = [
    {
        version: '2.0.0',
        date: '2026-07-05',
        sections: [
            {
                type: 'changed',
                items: [
                    {
                        zhTW: '全面改寫為 React 19，完成新版前端架構切換。',
                        en: 'Fully rewrote the app as a React 19 frontend with TanStack Router, TanStack Query, Zustand, shadcn/ui-style components, and Tailwind CSS v4.'
                    },
                    {
                        zhTW: '對齊 React rewrite 與 Vue 版視覺行為及核心支出流程。',
                        en: 'Aligned the React rewrite with the Vue-era visual behavior and core expense workflows.'
                    },
                    {
                        zhTW: 'Settings 全面增強：支援個人資料行內編輯、個人預算、多帳號管理、登出確認與版本資訊。',
                        en: 'Enhanced Settings with inline profile editing, personal budget management, multi-account management, logout confirmation, and version information.'
                    },
                    {
                        zhTW: '首屏 JS bundle（gzip）體積較 Vue 版減少約 27%（244 KiB → 178 KiB）。',
                        en: 'Reduced initial JS bundle size (gzip) by ~27% (244 KiB → 178 KiB) compared with the Vue build.'
                    },
                    {
                        zhTW: '支出清單導入虛擬化。',
                        en: 'Added expense list virtualization.'
                    },
                    {
                        zhTW: '加入新版 App 背景更新提示。',
                        en: 'Added background update prompts for newer app versions.'
                    },
                    {
                        zhTW: '金額顯示格式全面統一為「NT 1,234」（NT 加空格、不帶 $）。',
                        en: 'Unified the currency display format as "NT 1,234" (space-separated, no dollar sign) across the app.'
                    }
                ]
            },
            {
                type: 'added',
                items: [
                    {
                        zhTW: '新增推播通知：支援新分帳、收到結算與月報出爐提醒。',
                        en: 'Added push notifications for new split assignments, received settlements, and monthly report publication.'
                    },
                    {
                        zhTW: '新增由 user_settings.notification_prefs 支援的通知偏好開關。',
                        en: 'Added notification preference toggles backed by user_settings.notification_prefs.'
                    },
                    {
                        zhTW: '透過 vite-plugin-pwa injectManifest 與自訂 service worker 新增 PWA 離線與安裝能力。',
                        en: 'Added PWA offline/install behavior through vite-plugin-pwa injectManifest and the custom service worker.'
                    },
                    {
                        zhTW: '新增每月月報：包含月報頁、Dashboard 月初入口，以及 Settings 歷史列表。',
                        en: 'Added monthly reports, including the monthly report page, Dashboard entry point near month start, and Settings history list.'
                    },
                    {
                        zhTW: '新增偏好跨裝置同步：主題與語言儲存於 user_settings，跟著帳號走。',
                        en: 'Added cross-device preference sync: theme and language persist to user_settings and follow the account.'
                    }
                ]
            }
        ]
    },
    {
        version: '1.0.0',
        date: '2025-12-02',
        sections: [
            {
                type: 'added',
                items: [
                    {
                        zhTW: '導入 v2 群組支出模型：群組、成員、群組設定、支出分帳、結算、每月債務快照與群組 RPC。',
                        en: 'Introduced the v2 group-expense model: groups, members, group settings, expense splits, settlements, monthly debt snapshots, and group RPCs.'
                    },
                    {
                        zhTW: '新增週期支出、背景資料預載、下拉刷新、PWA manifest/離線快取與安裝支援。',
                        en: 'Added recurring expenses, background data preload, pull-to-refresh, PWA manifest/offline cache, and GitHub Pages deployment support.'
                    },
                    {
                        zhTW: '新增個人支出追蹤、多帳號管理、深色模式與帳號切換。',
                        en: 'Added personal expense tracking, multi-account management, dark mode, and account switching.'
                    },
                    {
                        zhTW: '新增 Firebase/Supabase 環境支援與 GitHub Pages SPA fallback。',
                        en: 'Added Firebase/Supabase environment support and GitHub Pages SPA fallback.'
                    }
                ]
            },
            {
                type: 'changed',
                items: [
                    {
                        zhTW: '將 Vue app 重構為 feature-based 結構。',
                        en: 'Refactored the Vue app toward a feature-based structure.'
                    },
                    {
                        zhTW: '透過 v2 waves 迭代支出、Dashboard、群組、結算與統計頁面。',
                        en: 'Iterated expense, dashboard, group, settlement, and statistics pages through the v2 waves.'
                    },
                    {
                        zhTW: '更新 app icon、清理文件並調整部署 workflow 結構。',
                        en: 'Updated app icon, cleanup docs, and deployment workflow structure.'
                    }
                ]
            },
            {
                type: 'fixed',
                items: [
                    {
                        zhTW: '完成 2026 年 6 月稽核修復：auth 清理、guard fail-safe、NT' + '$/i18n 一致性、週期支出 off-by-one、split 守恆、TWD 整數債務建議、結算快取失效與 startup route 修正。',
                        en: 'Completed the June 2026 audit repair series: auth cleanup, guard fail-safe behavior, NT' + '$/i18n consistency, recurring expense off-by-one behavior, split conservation, integer TWD debt suggestions, settlement cache invalidation, and startup route fixes.'
                    },
                    {
                        zhTW: '修正 GitHub Pages OAuth redirect、Firebase service worker 路徑、CSP/404 fallback 與 workflow typecheck 問題。',
                        en: 'Fixed GitHub Pages OAuth redirects, Firebase service worker path issues, CSP/404 fallback behavior, and workflow typecheck problems.'
                    },
                    {
                        zhTW: '修正 1.3.x 系列的 drawer/popover 行動裝置互動與支出表單排序問題。',
                        en: 'Fixed drawer/popover mobile interaction and expense form ordering issues in the 1.3.x series.'
                    }
                ]
            },
            {
                type: 'security',
                items: [
                    {
                        zhTW: '新增 CI quality gate 與 deployment check 的 branch protection 期望。',
                        en: 'Added branch protection expectations around the CI quality gate and deployment check.'
                    },
                    {
                        zhTW: '記錄並套用 search_path、legacy public RPC access 與 Supabase 平台 follow-up 的後端 hardening。',
                        en: 'Documented and applied backend hardening work for search_path, legacy public RPC access, and Supabase platform follow-ups.'
                    }
                ]
            }
        ]
    }
]
