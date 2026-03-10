---
name: Couple Expense Tracker
description: 情侶記帳應用程式 - 記錄共同開支，讓愛情更甜蜜
---

# 情侶記帳 App

一個專為情侶設計的記帳應用程式，讓兩人可以輕鬆記錄和管理共同開支。

## 功能特色

- 💑 **情侶共享帳本** - 兩人共同管理支出記錄
- 📊 **支出統計分析** - 視覺化呈現各類別支出
- 📅 **月度預算管理** - 設定和追蹤每月預算
- 🔔 **推播通知提醒** - 支出提醒和每日/週報總結
- 🌓 **深色模式支援** - 自動切換明暗主題
- 🌍 **多語言支援** - 支援繁體中文和英文

## 技術棧

- **前端框架**: Vue 3 + TypeScript
- **狀態管理**: Pinia
- **UI 框架**: Reka UI (Radix UI Vue) + Tailwind CSS v4
- **後端服務**: Supabase (資料庫與認證)
- **推播通知**: Firebase Cloud Messaging
- **構建工具**: Vite + Bun
- **部署**: GitHub Pages (自動部署)

## Build

### DEV
```bash
bun run dev
```

### PROD
```bash
bun run build
```

## 環境需求

- Node.js 18+
- Bun 1.0+

## 快速開始

1. **複製專案**
```bash
git clone https://github.com/NakiriYuuzu/couple-expense.git
cd couple-expense
```

2. **安裝依賴**
```bash
bun install
```

3. **設定環境變數**
```bash
cp .env.sample .env
# 編輯 .env 檔案，填入必要的設定
```

4. **啟動開發伺服器**
```bash
bun run dev
```

## GitHub Pages 部署

本專案已設定自動部署到 GitHub Pages：

1. **啟用 GitHub Pages**
   - Settings → Pages → Source: Deploy from a branch
   - Branch: gh-pages / (root)

2. **發布 Release**
   - 創建新的 Release 會自動觸發部署
   - 部署網址：`https://[username].github.io/[repository-name]/`

詳細部署說明請參考 [GitHub Pages 部署指南](./docs/github-pages-deployment.md)

## 專案結構

```
src/
├── components/     # 可重用元件
├── views/         # 頁面元件
├── stores/        # Pinia 狀態管理
├── routers/       # 路由設定
├── lib/           # 工具函式
└── assets/        # 靜態資源
```

## 主要依賴

- [Bun](https://bun.sh/) - JavaScript 執行環境和套件管理器
- [Vue 3](https://vuejs.org/) - 漸進式 JavaScript 框架
- [TypeScript](https://www.typescriptlang.org/) - JavaScript 的超集
- [Vite](https://vitejs.dev/) - 下一代前端構建工具
- [Pinia](https://pinia.vuejs.org/) - Vue 狀態管理
- [Vue Router](https://router.vuejs.org/) - Vue 官方路由
- [Reka UI](https://reka-ui.com/) - Vue 的 Radix UI 移植版
- [Tailwind CSS](https://tailwindcss.com/) - 實用優先的 CSS 框架
- [Supabase](https://supabase.com/) - 開源 Firebase 替代方案
- [Firebase](https://firebase.google.com/) - 推播通知服務

## 授權

MIT License