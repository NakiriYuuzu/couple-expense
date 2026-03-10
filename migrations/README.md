# 資料庫遷移

這個目錄包含資料庫結構變更的 SQL 遷移腳本。

## 如何執行遷移

### 使用 Supabase Dashboard
1. 登入 [Supabase Dashboard](https://supabase.com/dashboard)
2. 選擇你的專案
3. 前往 **SQL Editor**
4. 複製並執行對應的遷移腳本

### 使用 Supabase CLI
```bash
# 如果尚未安裝 Supabase CLI
npm install -g supabase

# 執行遷移
supabase db push
```

## 遷移歷史

### 2025-01-08: add_fcm_token_to_user_settings.sql
- 在 `user_settings` 表中添加 `fcm_token` 欄位
- 用於存儲 Firebase Cloud Messaging 推播通知 token
- 添加索引和註解以提升查詢效能

## 注意事項

- 遷移腳本使用 `IF NOT EXISTS` 確保可重複執行
- 建議在執行前先備份資料庫
- 遷移完成後請確認應用程式功能正常

## 相關功能

FCM token 存儲功能整合：
- **前端**: `src/stores/notification.ts` - FCM token 管理
- **前端**: `src/stores/couple.ts` - 用戶設定更新
- **前端**: `src/lib/database.types.ts` - TypeScript 類型定義
- **後端**: `user_settings` 表新增 `fcm_token` 欄位