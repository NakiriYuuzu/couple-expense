# AGENTS.md

本檔案是提供給 Codex / agent 的專案工作指引。

## CRITICAL: WSL 環境必須使用 PowerShell

> **這是最高優先級規則，所有 agent 和 subagent 都必須遵守。**

本專案位於 Windows 掛載路徑 `/mnt/e/...`。WSL 透過 9P 橋接存取 Windows 檔案系統，I/O 密集操作（build、typecheck、test）會慢 3-10 倍。

**MUST**: 所有 `bun run`、`bunx` 指令都必須透過 `powershell.exe -Command` 執行。**禁止**在 WSL 內直接執行。

```bash
# ✅ 正確做法 — 所有 bun 指令都走 PowerShell
powershell.exe -Command "bun run dev"
powershell.exe -Command "bun run build"
powershell.exe -Command "bun run typecheck"
powershell.exe -Command "bun run test"
powershell.exe -Command "bun run preview"
powershell.exe -Command "bunx vitest run src/path/to/test.spec.ts"

# ❌ 錯誤做法 — 直接在 WSL 跑，3-10x 慢
bun run build
bun run typecheck
bun run test
```

**不需要用 PowerShell 的操作**：`git`、`grep`、`ls`、檔案讀寫等非前端工具鏈命令可直接在 WSL 執行。

## 其他優先規則

- 修改前先以實際程式碼、`package.json`、`vite.config.ts`、`vitest.config.ts` 為準，不要只依賴 `README.md`

## 專案摘要

- repo 名稱是 `couple-expense`
- `package.json` 名稱是 `family-expense`
- 這是一個 Vue 3 + TypeScript + Bun 的記帳前端
- 後端服務使用 Supabase
- 專案結構已偏向 feature-sliced 分層

## 技術棧

- Bun
- Vue 3
- TypeScript
- Vite 8 beta
- Pinia
- `pinia-plugin-persistedstate`
- Vue Router 4
- `vue-i18n`
- `vee-validate`
- `zod`
- `vue-chartjs`
- `chart.js`
- `@unovis/vue`
- Supabase
- Vitest
- happy-dom
- Vue Test Utils
- `vite-plugin-pwa`
- Tailwind CSS v4
- Reka UI / shadcn-vue 風格元件

## 目錄重點

```text
src/
├── app/         # app shell、router、全域樣式
├── entities/    # 純型別定義
├── features/    # 業務功能
├── pages/       # 路由頁面
└── shared/      # 共用元件、stores、i18n、lib、utils
```

目前主要 feature 分區：

- `auth`
- `expense`
- `group`
- `split`
- `settlement`
- `statistics`

目前主要 page 分區：

- `startup`
- `dashboard`
- `expenses`
- `expense-detail`
- `overview`
- `settings`
- `group-list`
- `group-create`
- `group`

路由定義集中於 `src/app/router/routes/index.ts`。

## 常用命令

標準 script 來自 `package.json`，**在 WSL 環境一律使用 `powershell.exe -Command`**：

```bash
powershell.exe -Command "bun run dev"
powershell.exe -Command "bun run build"
powershell.exe -Command "bun run typecheck"
powershell.exe -Command "bun run preview"
powershell.exe -Command "bun run test"
powershell.exe -Command "bun run test:watch"
```

## 建置與測試備註

- `vite.config.ts` 的 `build.outDir` 是 `./dist/${mode}`
- `base` 來自 `VITE_APP_ROUTER_BASE`
- 路徑 alias `@` 指向 `./src`
- Vitest 測試環境是 `happy-dom`
- Windows 環境下，Vite HTTPS 會先嘗試 `dotnet dev-certs`，失敗才 fallback 到 `mkcert`

## 環境變數

至少需要：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_ROUTER_BASE`

`src/shared/lib/supabase.ts` 在缺少前兩者時會直接丟錯。

## 程式碼慣例

- JS / TS 使用四個空白縮排
- 不要加分號
- 不要加 trailing comma
- Vue 檔案優先維持 `<script setup lang="ts">`
- store 入口集中在 `src/shared/stores/index.ts`
- 匯入 store 時，優先從 store barrel 匯入

## 文件可信度

- `README.md` 偏對外說明，部分內容可能比實作舊
- `CLAUDE.md` 含較多接近現況的工作筆記
- 如有衝突，優先以實際程式碼與設定檔為準
