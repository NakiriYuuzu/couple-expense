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

| 操作 | 結果 |
|---|---|
| 按「記一筆」 | 卡片：切換帳本（個人／群組）、選分類；點分類會打開鍵盤（LINE 12.6.0 以上） |
| 輸入 `午餐 120`、`120 午餐`、`午餐120元` | 草稿卡片；10 分鐘內在記一筆卡片選過的分類會自動帶入 |
| 草稿卡片 | 可改帳本、分類（下方快速按鈕）、日期（日期選擇器）；群組可選付款人與分攤 |
| 按「確認入帳」 | 才寫入；回覆附「在網頁版查看這筆」 |

- 分攤模型：付款人＋參與者，參與者以「分」均分（100/3 → 33.34、33.33、33.33）。
  - 兩人群組：全員均分、只算我（全部算自己的）、只算對方（自己代墊，對方全額負擔）。
  - 多人群組：全員均分、只算我，另可逐人勾選參與者。
  - 指定金額、百分比、份數請用網頁版。
- 入帳在 `line_bot.confirm_draft` 內以綁定的使用者身分執行（`SET LOCAL ROLE authenticated` ＋ `request.jwt.claims`），
  沿用 v3-08 的成員、付款人、分攤驗證；付款人或參與者已退出群組時入帳失敗，不會默默改變分攤。
- 草稿列鎖定後才檢查狀態：連按或同時確認只入帳一次。草稿 1 天後過期。幣別固定 TWD。
- Migration：`line-bot-03-drafts.sql`、`line-bot-06-draft-options.sql`。測試用的
  `tests/fixtures/group-expense-live-subset.sql` 取自正式環境（v3-08 套用後）的欄位、RLS 與函式定義。

## 網頁版按鈕

已綁定使用者的每則回覆都附「在網頁版…」按鈕（`WEB_APP_URL` ＋ `openExternalBrowser=1`，用手機瀏覽器開啟以沿用登入）：
記一筆／一般回覆 → 首頁、草稿與入帳 → 該筆明細、最近紀錄 → 支出列表、本月統計 → 統計頁、帳本 → 群組管理。
從連結直接開啟網頁時，左上返回鍵會回到首頁。

## 圖文選單

| 按鈕 | 送出文字 | 功能 |
|---|---|---|
| 記一筆 | `記一筆` | 記一筆卡片：切換帳本、選分類後輸入 |
| 帳本 | `帳本` | 切換個人／群組帳本 |
| 最近紀錄 | `最近紀錄` | 目前帳本最近 10 筆，可按「更多紀錄」翻頁；個人帳本含自己在群組費用的分攤 |
| 本月統計 | `本月統計` | 台北時間本月總額、與上月比較、各分類長條（只計台幣；個人帳本＝個人費用＋群組分攤，與網頁版「我的支出」一致） |
| 誰欠誰 | `誰欠誰` | 群組帳本的簡化欠款（沿用 App 的 `get_simplified_debts`） |
| 說明 | `說明` | 用法 |

- 按鈕使用 message action，手動輸入同樣文字效果相同。按鈕文字與 `handler.ts` 的 `menuCommands`
  由 `tests/line-rich-menu.spec.ts` 保證一致。
- 查詢在 `migrations/line-bot-04-queries.sql` 的函式內以綁定使用者身分執行，只看得到 App 裡本來看得到的資料。
- 修改選單：編輯 `scripts/line-rich-menu/menu.ts` →

```sh
bun scripts/line-rich-menu/cli.ts svg      # 產生 menu.svg
scripts/line-rich-menu/render.sh           # 轉成 menu.png（需 macOS PingFang 與 uv）
LINE_CHANNEL_ACCESS_TOKEN=... bun scripts/line-rich-menu/cli.ts deploy
```

`deploy` 會建立新選單、設為預設，再刪除同名（`couple-expense`）的舊選單。

## 群組新增費用通知

任何人在群組新增費用（App、Bot、週期費用皆算），會私訊通知同群組其他成員：

- 收件人：有效成員、已綁定 LINE、未封鎖 Bot、App 設定的「分帳通知」未關閉；記帳的人自己不會收到。
- 卡片：品項、金額、記帳人、收件人的分攤、分類、日期，以及「在網頁版查看」按鈕
  （`{WEB_APP_URL}expenses/{id}?openExternalBrowser=1`，用手機瀏覽器開啟以沿用登入狀態）。
- 流程：`expenses` 的 deferred trigger 在交易提交時寫入 `line_bot.notification_outbox` → pg_net 呼叫
  `line-notify` → LINE push（`X-Line-Retry-Key` = outbox id，重送不重複）。
- 失敗：429／5xx／網路錯誤由 cron `line-bot-notify-retry` 每 10 分鐘補送，最多 5 次；其他 4xx 標為 failed。
  通知失敗不影響記帳。
- 設定：`migrations/line-bot-05-notifications.sql`；Edge secrets `LINE_NOTIFY_SECRET`、`WEB_APP_URL`；
  Vault `line_notify_url`、`line_notify_secret`（與 `LINE_NOTIFY_SECRET` 相同）。

```sh
supabase functions deploy line-notify --no-verify-jwt
```

查看送出狀況：`SELECT status, attempts, last_error, created_at FROM line_bot.notification_outbox ORDER BY created_at DESC LIMIT 20;`

## 已知限制

- 事件登記後若函式在處理中途當掉，該事件不會重試（第 1 步只有回覆訊息，無帳務寫入）。
- `webhook_events`、過期的 `link_nonces`、已送出的 `notification_outbox` 尚未自動清理，之後再加保存期限。
- 只通知新增；修改、刪除、結清不通知。
