# FCM 推播通知設定指南（Phase 6）

本專案的推播通知走三層通知子系統：DB trigger（`migrations/v3-06-notification-triggers.sql`）
偵測 `expense_splits` / `settlements` 新列 → 以 `pg_net` 非同步呼叫 Edge Function
`send-push`（`supabase/functions/send-push/index.ts`）→ `send-push` 依收件人的
`notification_prefs` 過濾後，透過 Firebase Cloud Messaging（FCM）HTTP v1 API 送到
`user_devices` 裡登記的每個裝置。

事件種類固定三種：`split_assigned`（被分帳）、`settlement_received`（收到結算）、
`monthly_report`（月報，發送邏輯屬 Phase 7，本文件僅涵蓋 send-push 本身已支援此
事件種類）。

⚠ 本文件中標示「需核准」的步驟（部署 Edge Function、套用 trigger SQL、設定
production secrets）都會變更 live 環境，請自行確認後手動執行；本文件只提供可複製
的指令樣板，不會替你執行。

## 1. Firebase Console 設定

### 1.1 建立 / 選擇 Firebase 專案

前往 [Firebase Console](https://console.firebase.google.com/) 建立新專案，或選用既有
專案（可與其他服務共用同一個 Firebase 專案）。

### 1.2 確認 Cloud Messaging 已啟用

**Project Settings**（齒輪圖示）→ **Cloud Messaging** 分頁 → 確認
「Firebase Cloud Messaging API (V1)」為啟用狀態（新專案預設已啟用）。

### 1.3 產生 Web Push 憑證（VAPID key）

**Cloud Messaging** 分頁 → **Web configuration** → **Web Push certificates** →
**Generate key pair**。這把 key 給前端 `getToken({ vapidKey })` 使用（前端實作範圍，
見 §2）。

### 1.4 新增 Web App（若尚未建立）

**Project Settings** → **General** 分頁 → **Add app** → 選 Web（`</>`）→ 取得
`firebaseConfig`（`apiKey` / `authDomain` / `projectId` / `storageBucket` /
`messagingSenderId` / `appId`）。

### 1.5 下載 service account 金鑰（給 send-push 用）

**Project Settings** → **Service accounts** 分頁 → **Generate new private key** →
下載 JSON 檔。這份 JSON **不要提交到 repository**，只用於設定 Supabase Edge Function
的 secret（見 §3）。

## 2. 前端環境變數（`VITE_FIREBASE_*`）

以下為 Firebase Web SDK 慣用的環境變數命名（`docs/github-pages-deployment.md` 已可見
`VITE_FIREBASE_API_KEY` 這個既有慣例）：

| 變數 | 對應 firebaseConfig 欄位 | 用途 |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` | Firebase Web SDK 初始化 |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` | Firebase Web SDK 初始化 |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` | Firebase Web SDK 初始化 |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` | Firebase Web SDK 初始化 |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` | Firebase Web SDK 初始化 |
| `VITE_FIREBASE_APP_ID` | `appId` | Firebase Web SDK 初始化 |
| `VITE_FIREBASE_VAPID_KEY` | （§1.3 產生的 Web Push key） | `getToken({ vapidKey })` |

這些變數皆為前端公開設定（非機密），本機命名以 `.env.sample` 為準，並在
CI / deployment workflow 以對應名稱的 GitHub Secrets 注入建置流程，例如
`VITE_FIREBASE_API_KEY` → build 時映射為 `VITE_FIREBASE_API_KEY`。

這些 `VITE_FIREBASE_*` secrets 需在 GitHub repository Settings → Secrets and variables
→ Actions 建立；未設定時部署版推播功能會自動停用（其餘功能不受影響）。

> 這幾個變數的實際消費端是 `src/shared/lib/firebase.ts`、`src/sw.ts` 與
> `src/pages/settings/SettingsPage.tsx`；若命名與此處不同，以 `.env.sample` 及
> `src/shared/lib/firebase.ts` 的實際定案為準。

## 3. Supabase Edge Function 環境變數（`send-push`）

`SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase 平台自動注入所有 Edge
Function，**不需要**手動設定。需要手動設定的只有以下三個（**需核准後執行**）：

```bash
# Firebase 專案 ID（§1.1）
supabase secrets set FCM_PROJECT_ID=<firebase-project-id>

# service account 完整 JSON（§1.5 下載的檔案；優先於下面的拆欄位版本）
supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat /path/to/service-account.json)"

# 呼叫端共享密鑰（trigger 端會用同一把密鑰帶在 x-webhook-secret 標頭）
supabase secrets set SEND_PUSH_WEBHOOK_SECRET="$(openssl rand -hex 32)"
```

若不想整包 JSON 存成單一 secret，也可以拆成兩個變數（`send-push/index.ts` 有支援
這個備援路徑）：

```bash
supabase secrets set FCM_CLIENT_EMAIL=<service-account-client_email>
supabase secrets set FCM_PRIVATE_KEY="$(cat /path/to/private_key.pem)"
```

## 4. Supabase Vault 設定（trigger 呼叫 send-push 用）

`migrations/v3-06-notification-triggers.sql` 的兩個 trigger 讀取 Supabase Vault 取得
`send-push` 的呼叫網址、共享密鑰、以及過平台 `verify_jwt` 用的 service role key。套用
trigger migration **之前**，先在 Supabase SQL Editor（**需核准後執行**）建立這三把
密鑰：

```sql
select vault.create_secret(
    'https://<project-ref>.supabase.co/functions/v1/send-push',
    'send_push_url',
    'send-push Edge Function 呼叫網址'
);

select vault.create_secret(
    '<與 §3 SEND_PUSH_WEBHOOK_SECRET 相同的值>',
    'send_push_shared_secret',
    'send-push 呼叫端共享密鑰，需與 SEND_PUSH_WEBHOOK_SECRET 一致'
);

select vault.create_secret(
    '<專案的 service_role key（Dashboard → Settings → API）>',
    'send_push_service_key',
    'trigger 呼叫 send-push 時過 Supabase 平台 verify_jwt 用；此為 service_role key，具最高權限，只放 Vault 不進 repo'
);
```

⚠ `send_push_service_key` 的值是專案的 **service_role key**——擁有繞過 RLS 的最高權限，
外洩風險等同資料庫 root。只透過 Vault 存放，不要寫進 `.env`、CI log、或任何前端可觸及的
環境變數。

⚠ 當 `SUPABASE_SERVICE_ROLE_KEY` 旋轉時，請務必同步更新 Vault 的
`send_push_service_key` 值。平台會更新 Edge Function 可見的 `SUPABASE_SERVICE_ROLE_KEY`，
但 Vault 是獨立存儲，不會自動同步到既有 secret。若只旋轉平台端金鑰而 Vault 未更新到
新值，trigger 仍會用舊 key 呼叫 send-push，平台 verify_jwt 將以 401 拒絕，且因 pg_net fire-and-forget
觸發端不會看到這次回傳，最後表現為推播靜默停擺；請更新 Vault secret 的值以對齊新 key。

⚠ `send_push_service_key` 應填寫 Dashboard **Settings → API** 的 legacy JWT 服務角色金鑰
（通常以 `eyJ...` 開頭），而非較新的 `sb_secret_...` 型別。後者無法通過 send-push 的平台
verify_jwt 驗證，會導致請求在平台閘道先被拒絕。

若目標專案未啟用 Vault，`migrations/v3-06-notification-triggers.sql` 檔尾有記錄改用
GUC（`ALTER DATABASE ... SET app.settings.xxx`）的替代寫法。

## 5. 部署 Edge Function（**需核准後執行**）

```bash
supabase functions deploy send-push
```

不要加 `--no-verify-jwt`：`send-push` 的呼叫端驗證設計假設 Supabase 平台預設的
`verify_jwt = true` 仍然生效，作為第一層防線（見 `index.ts` 檔頭註解）。

## 6. 套用 Trigger SQL（**需核准後執行**）

`migrations/v3-06-notification-triggers.sql` 目前只是寫好待審的檔案，尚未套用到任何
資料庫。確認 §4 的 Vault 密鑰已建立後，將整份檔案內容貼到 Supabase Dashboard 的
SQL Editor 執行，再依檔案內「驗證 SQL」區塊的查詢逐段確認：extension 已啟用、兩個
trigger 已建立且為 STATEMENT-level、Vault 密鑰查得到。

## 7. 測試 send-push

Edge Function 部署完成後，可用 `curl` 直接呼叫測試（不需先套用 trigger）。**在預設
`verify_jwt = true` 部署下，請求必須帶合法的 Supabase JWT 於 `Authorization`，否則會
在抵達 function 之前就被平台閘道擋下（401 `UNAUTHORIZED_NO_AUTH_HEADER`）**——這也是
trigger 呼叫 send-push 時，除了 `x-webhook-secret` 外一定要另外帶
`Authorization: Bearer <service_role key>` 的原因（見 §4 的 `send_push_service_key`、
`migrations/v3-06-notification-triggers.sql`、`index.ts` 檔頭註解）。

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/send-push" \
    -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
    -H "Content-Type: application/json" \
    -d '{
        "userIds": ["<測試用的 user uuid>"],
        "event": "split_assigned",
        "title": "測試推播",
        "body": "這是一則測試訊息",
        "data": { "expenseId": "test", "url": "expenses/test" }
    }'
```

也可以同時帶上共享密鑰，行為與 trigger 端呼叫一致（雙防線）；但 `x-webhook-secret`
單獨帶、不帶 `Authorization`，在預設 `verify_jwt = true` 下仍會在平台層被擋下，
**無法**單獨用來測試：

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/send-push" \
    -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
    -H "x-webhook-secret: <SEND_PUSH_WEBHOOK_SECRET>" \
    -H "Content-Type: application/json" \
    -d '{ "userIds": ["<測試用的 user uuid>"], "event": "settlement_received", "title": "測試", "body": "測試訊息", "data": { "url": "overview" } }'
```

送達裝置的實際 FCM payload 是 **data-only message**（刻意不帶 `notification` 欄位，
避免 FCM SDK 背景自動顯示一則、`sw.ts` 又顯示第二則的雙通知問題）：上面 `-d` 帶的
`title`/`body` 會被併入 FCM 訊息的 `data`（連同 `data` 欄位裡其他鍵，如 `url`），由
前端 `sw.ts` 的 `onBackgroundMessage` 讀 `payload.data.title` / `payload.data.body` /
`payload.data.url` 自行呼叫 `showNotification()` 建構唯一的通知。

測試前記得該 `userIds` 對應的使用者已在 `user_devices` 註冊至少一個裝置（前端登入
後會自動 upsert），否則會回傳 `sent: 0`（無裝置可送，非錯誤）。

## 8. 疑難排解 / 已知風險與假設

- **pg_net 所在 schema**：本文件與 trigger SQL 假設 `pg_net` 以 Supabase 預設方式安裝
  （函式在 `net` schema）。若目標專案的安裝路徑不同，需調整 trigger 函式內
  `net.http_post` 的 schema 前綴。
- **Vault 可用性**：假設目標 Supabase 專案已啟用 Vault（多數專案預設啟用）。若未
  啟用，改走 §4 提到的 GUC 替代方案。
- **`verify_jwt` 預設值**：本文件與 `supabase/functions/send-push/index.ts` 假設專案未覆寫 Supabase
  預設的 `verify_jwt = true`。這個假設
  是目前驗證設計能生效的**前提**，不只是背景說明：trigger 與 cron 呼叫 send-push 都
  必須帶 `Authorization: Bearer <service_role key>`（trigger 從 Vault 的
  `send_push_service_key` 讀出），否則平台閘道會在 function 執行前就以 401 擋下，
  `x-webhook-secret` 單獨存在時完全沒有機會被檢查到。若之後刻意調整為 `false`，
  `index.ts` 內以 `x-webhook-secret` 驗證的路徑才會單獨生效，但「必須帶合法 Supabase
  JWT」這層平台防線會消失，請自行評估風險。
- **`send-push` 回應非即時送達保證**：`pg_net.http_post` 是非同步呼叫（fire-and-forget），
  trigger 內任何呼叫失敗只會 `RAISE WARNING`，不會讓記帳/結算交易失敗，但也代表
  trigger 本身看不到 `send-push` 的執行結果——除錯請查 Supabase Dashboard 的
  Edge Function Logs，或 `net._http_response` 資料表（見 v3-06 檔尾驗證 SQL）。
- **`net._http_response` 是關鍵排障點**：遇到「通知悄悄沒送出」時，請直接查
  `net._http_response`（例如 `select status_code, count(*) from net._http_response group by 1;`）；
  因 `pg_net` 為 fire-and-forget，像 key 旋轉後未同步或 key 格式錯誤造成的平台 401 等失敗
  不會回到應用交易層，只會留在這張表。
- **殭屍 token 清理**：`send-push` 收到 FCM 回應 `UNREGISTERED` / `NOT_FOUND` 時會以
  service role 權限刪除對應的 `user_devices` 列；`last_seen_at` 逾 90 天的裝置由既有
  的月報 cron 另行清理（見 `migrations/v3-01-user-devices.sql`），本文件不重複涵蓋。
## 9. 月報 cron 與月報函式（monthly-report）

功能口徑、`monthly_reports.data` shape 與冪等語意另見 `docs/monthly-report.md`；本節只保留部署與手動補跑指令。

### 9.1 建立月報 Edge Function 呼叫網址（Vault）

`migrations/v3-07-monthly-report-cron.sql` 的排程會讀 `monthly_report_url`，再以
`send_push_service_key` 呼叫月報函式。`monthly_report_url` 只需要一筆，值為月報
Edge Function 的完整網址。

`send_push_service_key` 可沿用 v3-06 已建立的同名 Vault secret，
本步驟不需新增新金鑰。

```sql
select vault.create_secret(
    'https://<project-ref>.supabase.co/functions/v1/monthly-report',
    'monthly_report_url',
    'monthly-report Edge Function 呼叫網址'
);
```

### 9.2 部署月報 Edge Function（不改 verify_jwt）

```bash
supabase functions deploy monthly-report
```

請保留 `verify_jwt` 平台預設（`true`），不要新增/修改
Supabase Edge Function 的 `verify_jwt` 覆寫，與 send-push 的驗證前提保持一致。

### 9.3 手動觸發回補（特定月份）

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/monthly-report" \
    -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
    -H "Content-Type: application/json" \
    -d '{ "yearMonth": "2026-06" }'
```

### 9.4 重跑與幂等性

同一 `yearMonth` 多次執行是安全的：`monthly_reports` row 會用同一
`(user_id, year_month)` upsert，`data`（內含新的 `generatedAt` 時間戳）會整包覆寫，
`notified_at` / `read_at` 因 upsert 未帶這兩欄而不會被覆蓋，因此不會重複推播
（`notified_at IS NULL` 過濾機制仍保留）。

同月並發執行（cron 與手動觸發同時）可能對同一使用者重複推播一次——pending 查詢與推播間無原子 claim。屬已知限制，衝擊為多收一則通知，不影響資料。
