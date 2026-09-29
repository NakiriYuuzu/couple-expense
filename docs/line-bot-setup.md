# LINE Bot 設定（第 1 步：接通 webhook）

目前 Bot 只會：驗證 LINE 簽章、去除重送事件、記錄加好友／封鎖，並提示未綁定的使用者輸入「綁定」。綁定與記帳在第 2、3 步加入。

相關檔案：

- `supabase/functions/line-webhook/`：webhook（`handler.ts` 為核心邏輯，`index.ts` 為 Deno 入口）
- `migrations/line-bot-01-webhook.sql`：`line_bot` schema（事件去重、LINE 帳號對照）

## 1. LINE 後台

1. 在 [LINE Official Account Manager](https://manager.line.biz/) 建立官方帳號。
2. 帳號設定 → Messaging API → 啟用，並選擇 **Provider**。
   - 之後的綁定流程也用這個 Provider；channel 建立後無法搬到其他 Provider，名稱請取長期可用的。
3. 回應設定：
   - Webhook：**開啟**
   - 自動回應訊息：**關閉**（避免和 Bot 回覆重複）
   - 加入好友的歡迎訊息：**關閉**（Bot 會自己回歡迎訊息）
4. 到 [LINE Developers Console](https://developers.line.biz/console/) 找到該 channel：
   - Basic settings → 複製 **Channel secret**
   - Messaging API → 發行 **Channel access token (long-lived)**
   - Messaging API → **Allow bot to join group chats：關閉**（Bot 只服務 1:1 私聊）
   - Messaging API → Webhook URL：`https://<project-ref>.supabase.co/functions/v1/line-webhook`
   - **Use webhook：開啟**；**Webhook redelivery：開啟**（DB 暫時失敗時讓 LINE 重送）

Channel secret 與 access token 不要放進前端、repo 或聊天訊息。

## 2. Supabase

1. SQL Editor 執行 `migrations/line-bot-01-webhook.sql`（只新增 `line_bot` schema，可重跑）。
   - **不要**把 `line_bot` 加進 API 的 Exposed schemas。
2. 設定函式密鑰並部署（`SUPABASE_DB_URL` 為 Edge Function 預設提供）：

```sh
supabase secrets set LINE_CHANNEL_SECRET=... LINE_CHANNEL_ACCESS_TOKEN=...
supabase functions deploy line-webhook --no-verify-jwt
```

`--no-verify-jwt` 只用在這支函式：LINE 不會帶 Supabase JWT，來源由函式內的簽章驗證把關。

## 3. 驗收

1. LINE Developers Console 的 Webhook URL 按 **Verify** → 成功。
2. 用手機加官方帳號好友 → 收到「歡迎使用記帳 Bot！請輸入「綁定」…」。
3. 傳任意訊息 → 收到「你還沒有綁定記帳帳號…」；傳「綁定」→ 收到綁定按鈕（第 2 步）。
4. SQL Editor 查 `SELECT * FROM line_bot.webhook_events ORDER BY received_at DESC LIMIT 10;`
   - 每個事件一列，`processed_at` 有值、`error` 為空。

## 第 2 步：綁定

流程：LINE 傳「綁定」→ Bot 回按鈕（外部瀏覽器開啟）→ `/line-link` 綁定頁登入（Email 或 Google）→
`line-link` 函式確認登入並產生一次性 nonce（10 分鐘）→ 導向 LINE 官方綁定頁 →
LINE 送 `accountLink` 事件 → `line_bot.complete_link` 消耗 nonce 並建立對照。

- 已綁定：傳「解除綁定」可解除；一個 LINE 只能綁一個帳號，反之亦然，已綁定的不會被覆蓋。
- 相關檔案：`supabase/functions/line-link/`、`supabase/functions/_shared/nonce.ts`、
  `migrations/line-bot-02-link.sql`、`src/routes/line-link.tsx`、`src/pages/line-link/`。

部署順序：

1. SQL Editor 執行 `migrations/line-bot-02-link.sql`。
2. Supabase Auth → Sign In / Providers → **關閉 Allow new users to sign up**（只開放既有帳號）。
3. 前端推上 `main`，等 GitHub Pages 部署出 `/line-link`。
4. 函式：

```sh
supabase secrets set LINE_LINK_PAGE_URL=https://github.yuuzu.net/couple-expense/line-link
supabase functions deploy line-link --no-verify-jwt
supabase functions deploy line-webhook --no-verify-jwt
```

`line-link` 由函式內向 Supabase Auth 驗證使用者（`/auth/v1/user`），所以同樣不用平台的 JWT 檢查。

## 第 3 步：記帳

| 輸入 | 動作 |
|---|---|
| `午餐 120`、`120 午餐`、`午餐120元` | 建立草稿卡（下方快速按鈕可改分類），按「確認入帳」才寫入 |
| `帳本` | 切換個人或群組帳本（只列出有效成員的群組） |
| 其他文字 | 顯示用法 |

- 入帳在 `line_bot.confirm_draft` 內以綁定的使用者身分執行（`SET LOCAL ROLE authenticated` ＋
  `request.jwt.claims`），既有 RLS 與 `add_group_expense` 的成員檢查照常生效。
- 草稿列鎖定後才檢查狀態：連按或同時確認只入帳一次。草稿 1 天後過期。
- 群組帳：付款人為自己，有效成員以「分」均分，尾差依加入順序分配（100/3 → 33.34、33.33、33.33）。
  正式版 `add_group_expense` 不會自動均分，所以一定明確傳入 splits。
- 幣別固定 TWD；其他分帳方式、改帳、刪帳、結清尚未提供。
- Migration：`migrations/line-bot-03-drafts.sql`。測試用的 `tests/fixtures/group-expense-live-subset.sql`
  取自正式環境的欄位、RLS 與函式定義。

## 已知限制

- 事件登記後若函式在處理中途當掉，該事件不會重試（第 1 步只有回覆訊息，無帳務寫入）。
- `webhook_events`、過期的 `link_nonces` 尚未自動清理，之後再加保存期限。
