# GitHub Pages 自動部署指南

本專案已設定 GitHub Actions 自動部署到 GitHub Pages，每當發布新的 Release 時會自動觸發部署。

## 快速開始

### 1. 初始設定

執行設定腳本：
```bash
./.github/scripts/setup-gh-pages.sh
```

### 2. 設定環境變數

編輯 `.env.production` 檔案，確保包含所有必要的環境變數：
```env
VITE_APP_ROUTER_BASE=/your-repo-name/
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-key
VITE_FIREBASE_API_KEY=your-firebase-api-key
# ... 其他 Firebase 設定
```

### 3. 啟用 GitHub Pages

1. 前往 GitHub repository 的 **Settings** → **Pages**
2. Source 選擇 **Deploy from a branch**
3. Branch 選擇 **gh-pages** / **/ (root)**
4. 儲存設定

### 4. 發布 Release

1. 前往 **Releases** 頁面
2. 點擊 **Create a new release**
3. 創建新的 tag（例如：`v1.0.0`）
4. 填寫 release 資訊
5. 點擊 **Publish release**

## 自動部署流程

當發布新的 Release 後，GitHub Actions 會自動：

1. 檢出最新代碼
2. 安裝 Bun 環境
3. 安裝專案依賴
4. 使用 production 模式構建專案
5. 部署到 gh-pages 分支

## 檔案結構

```
.github/
├── workflows/
│   ├── deploy-gh-pages.yml    # 主要的部署 workflow
│   └── README.md              # workflow 說明文件
└── scripts/
    └── setup-gh-pages.sh      # 環境設定腳本
```

## 注意事項

### Base URL 設定

- GitHub Pages 會部署在 `https://[username].github.io/[repository-name]/` 路徑下
- workflow 會自動設定 `VITE_APP_ROUTER_BASE` 為正確的路徑
- 確保專案中的資源引用都使用相對路徑

### Firebase 設定

- Firebase 需要 HTTPS 才能正常運作
- GitHub Pages 預設提供 HTTPS
- 確保 Firebase 設定中的 domain 包含你的 GitHub Pages 網址

### 環境變數

- 敏感資訊不應該提交到 repository
- 可以考慮使用 GitHub Secrets 來存儲敏感的環境變數
- 公開的設定（如 Firebase 的 public key）可以直接寫在 `.env.production`

## 疑難排解

### 部署失敗

1. 檢查 Actions 頁籤的錯誤訊息
2. 確認本地可以正常執行 `bun run build`
3. 檢查是否有遺漏的環境變數

### 頁面 404

1. 確認 GitHub Pages 已啟用
2. 檢查 gh-pages 分支是否存在
3. 確認 base URL 設定正確

### 資源載入失敗

1. 檢查瀏覽器 Console 的錯誤訊息
2. 確認資源路徑使用正確的 base URL
3. 檢查 Service Worker 是否正確註冊

## 手動部署

如果需要手動部署，可以：

```bash
# 構建專案
VITE_APP_ROUTER_BASE=/your-repo-name/ bun run build

# 部署到 gh-pages
npx gh-pages -d dist/production
```

## 相關連結

- [GitHub Pages 文檔](https://docs.github.com/en/pages)
- [GitHub Actions 文檔](https://docs.github.com/en/actions)
- [Vite 部署指南](https://vitejs.dev/guide/static-deploy.html#github-pages)