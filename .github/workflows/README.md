# GitHub Actions Workflows

## CI（品質閘門）

`ci.yml` 會在 push 到 `main` 與針對 `main` 的 pull_request 時執行型別檢查與測試：

- `bun run typecheck`（vue-tsc）
- `bun run test`（vitest）

任一步驟失敗即中止，確保型別錯誤或計算回歸不會進入部署。此 job 僅需 `contents: read` 權限。

## Deploy to GitHub Pages

`deploy-gh-pages.yml` 負責部署專案到 GitHub Pages。

### 觸發行為

- **push 到 `main`**：建置並部署到 `gh-pages`
- **發布 Release（published）**：建置並部署到 `gh-pages`
- **手動觸發（workflow_dispatch）**：建置並部署到 `gh-pages`
- **pull_request 到 `main`**：只執行建置驗證，**不會部署**（Deploy step 有 `if: github.event_name != 'pull_request'` 守衛，避免未審查的 PR 內容覆蓋正式環境）

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
- `VITE_APP_TITLE`（選填）
- `VITE_APP_API_BASE`（選填）

### 部署內容

- 部署目錄：`./dist/production`
- 會自動創建 `.nojekyll` 檔案，防止 GitHub Pages 的 Jekyll 處理
- 使用 force orphan 模式，每次部署都是全新的 commit
- 建置後會複製 `index.html` 為 `404.html` 作為 SPA fallback，讓 history 模式的深層路由直接訪問/重新整理可正常載入

### 疑難排解

如果部署失敗，請檢查：
1. GitHub Pages 是否已啟用
2. workflow 權限是否正確（deploy job 需要 `contents: write` 與 `pages: write`）
3. 專案是否能正常構建（本地執行 `bun run build`）
4. Supabase 相關的 GitHub Secrets 是否正確設定