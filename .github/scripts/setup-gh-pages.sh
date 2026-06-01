#!/bin/bash

# GitHub Pages 部署設定腳本
echo "🚀 設定 GitHub Pages 部署環境..."

# 檢查是否在 git repository 中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ 錯誤：請在 git repository 中執行此腳本"
    exit 1
fi

# 獲取 repository name
REPO_NAME=$(basename `git rev-parse --show-toplevel`)
echo "📦 Repository: $REPO_NAME"

# 檢查 .env 檔案
if [ ! -f .env ]; then
    echo "📝 創建 .env 檔案..."
    cp .env.sample .env
    echo "⚠️  請編輯 .env 檔案，填入必要的環境變數"
fi

# 創建 .env.production 檔案
echo "📝 創建 .env.production 檔案..."
cat > .env.production << EOF
# GitHub Pages 部署設定
VITE_APP_ROUTER_BASE=/$REPO_NAME/

# Supabase Configuration(請填入實際值)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# 應用設定(選填)
VITE_APP_TITLE=
VITE_APP_API_BASE=
EOF

# 提示用戶
echo ""
echo "✅ 設定完成！"
echo ""
echo "📋 後續步驟："
echo "1. 編輯 .env 檔案，填入 Supabase 相關設定(見 .env.sample)"
echo "2. 將 .env 中的必要變數複製到 .env.production"
echo "3. CI 會在 push 到 main、發布 Release 或手動觸發 workflow 時自動部署"
echo "4. 前往 Settings → Pages 確認 GitHub Pages 已啟用"
echo ""
echo "ℹ️  CI 部署實際使用 workflow 的 GitHub Secrets 注入環境變數，"
echo "    此 .env.production 僅供本地手動建置/驗證使用。"
echo ""
echo "🔗 部署後的網址將會是："
echo "   https://[你的GitHub用戶名].github.io/$REPO_NAME/"