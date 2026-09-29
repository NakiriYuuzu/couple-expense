# GitHub Actions Workflows

## CI（品質閘門）

`ci.yml` 會在 push 到 `main` 與針對 `main` 的 pull_request 時執行：

- `bun run typecheck`（TypeScript）
- `bun run lint`（ESLint）
- `bun run test`（Vitest）
- `bun run build`（Vite，含 PWA service worker）

此 job 僅需 `contents: read` 權限，測試與建置使用 dummy Supabase 設定，不需要 secrets，支援 fork PR。部署 workflow 也會獨立執行 typecheck、lint、test；任一步驟失敗即停止部署。

### 工具鏈與版本管理

- Node.js 24 LTS：由 `package.json` 的 `engines.node` 選定
- Bun 1.4.2：由 `package.json` 的 `packageManager` 選定
- 依賴安裝使用 `bun install --frozen-lockfile`，升級時須同步更新 `bun.lock`
- Actions 鎖定官方 release 的完整 commit SHA，`.github/dependabot.yml` 每週檢查 Actions 更新
- TypeScript 使用 6.0.3；暫不升至 7，因 `typescript-eslint` 8.70.1 的 peer dependency 要求 `<6.1.0`
- `@types/node` 保留 24.x，與執行環境一致，而非使用對應 Node 26 的最新 major
- TypeScript 6 設定移除 deprecated `baseUrl`，alias 維持相對 `paths`；app/test 專案明確載入 `node` types，支援既有的 `process.env.NODE_ENV`
- Babel 8 自帶型別，不再直接依賴 Babel 7 的 `@types/babel__core`

## Deploy to GitHub Pages

`deploy-gh-pages.yml` 負責部署專案到 GitHub Pages。

### 觸發行為

- **push 到 `main`**：建置並部署到 `gh-pages`
- **發布 Release（published）**：建置並部署到 `gh-pages`
- **手動觸發（workflow_dispatch）**：建置並部署到 `gh-pages`
- **pull_request 到 `main`**：由 `ci.yml` 執行建置驗證，**不會觸發部署 workflow**

### 設定步驟

1. **啟用 GitHub Pages**
   - 前往專案的 Settings → Pages
   - Source 選擇 "Deploy from a branch"
   - Branch 選擇 "gh-pages" 和 "/ (root)"
   - 儲存設定

2. **確保 Repository 設定正確**
   - 專案必須是公開的（Public）或者有 GitHub Pages 功能的私有專案
   - Repository name 會作為部署的路徑（例如：`https://[username].github.io/[repository-name]/`）

3. **發布 Release**
   - 前往專案的 Releases 頁面
   - 點擊 "Create a new release"
   - 填寫 tag 版本號（例如：v1.0.0）
   - 發布 Release 後會自動觸發部署

### 手動觸發部署

如果需要手動觸發部署，可以：
1. 前往 Actions 頁籤
2. 選擇 "Deploy to GitHub Pages" workflow
3. 點擊 "Run workflow"
4. 選擇分支並執行

### 環境變數

workflow 自動設定：
- `VITE_APP_ROUTER_BASE`: 設定為 `/[repository-name]/`，確保資源路徑正確
- `NODE_ENV`: 設定為 `production`

需在 Settings → Secrets and variables → Actions 設定的 Secrets（與 `.env.sample` 一致）：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

以上兩項為必填，部署前會檢查非空；以下為選填：
- `VITE_APP_TITLE`（選填）
- `VITE_APP_API_BASE`（選填）
- `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`、`VITE_FIREBASE_MESSAGING_SENDER_ID`、`VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY`（以上 Firebase 設定未提供時，推播功能停用）

### 部署內容

- 部署目錄：`./dist/production`
- 會自動創建 `.nojekyll` 檔案，防止 GitHub Pages 的 Jekyll 處理
- 使用 force orphan 模式，每次部署都是全新的 commit
- 建置後會複製 `index.html` 為 `404.html` 作為 SPA fallback，讓 history 模式的深層路由直接訪問/重新整理可正常載入

### 疑難排解

如果部署失敗，請檢查：
1. GitHub Pages 是否已啟用
2. workflow 權限是否正確（deploy job 只需要 `contents: write`；分支部署不需要 `pages: write` 或 `id-token: write`）
3. 專案是否能正常構建（本地執行 `bun run build`）
4. Supabase 相關的 GitHub Secrets 是否正確設定