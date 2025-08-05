# GitHub Actions Workflows

## Deploy to GitHub Pages

此 workflow 會在發布新的 Release 時自動部署專案到 GitHub Pages。

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

workflow 會自動設定以下環境變數：
- `VITE_APP_ROUTER_BASE`: 設定為 `/[repository-name]/`，確保資源路徑正確
- `NODE_ENV`: 設定為 `production`

### 部署內容

- 部署目錄：`./dist/production`
- 會自動創建 `.nojekyll` 檔案，防止 GitHub Pages 的 Jekyll 處理
- 使用 force orphan 模式，每次部署都是全新的 commit

### 疑難排解

如果部署失敗，請檢查：
1. GitHub Pages 是否已啟用
2. workflow 權限是否正確（需要 pages write 權限）
3. 專案是否能正常構建（本地執行 `bun run build`）
4. Firebase 相關的環境變數是否正確設定