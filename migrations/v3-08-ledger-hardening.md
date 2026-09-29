# v3-08：權限、分帳與結清 RPC 強化

**2026-09-29 已套用正式資料庫**（見文末「正式環境套用紀錄」）。`schema.sql` 是目標快照，不是可直接部署的 baseline；不得用它覆蓋 production。

## 本批變更

- 以非公開 schema 的 membership helper 修正群組 RLS 自我遞迴及外層欄位綁定。
- 群組讀取 RPC 主動驗證 active membership；保留 service_role 與本來就能使用 service_role 的直接 DB／cron session。
- 撤銷 PUBLIC／anon／authenticated 對 Vault helper、週期批次與快照產生 RPC 的執行權限；內部排程保留 service_role。
- Membership、splits、settlements 的應用寫入集中於 RPC；群組費用禁止裸表新增／更新，個人新增／更新仍使用原路徑。
- 新增、更新共用分帳驗證：有限正支出、非負有限分攤、有效付款人／參與者、UUID 不重複、分幣總和守恆。
- 自動等分使用整數分及固定順序分配尾差；100/3 存入 33.34、33.33、33.33。保留 explicit splits 的既有 sum-then-round-once 契約，未改變整元清償模型。
- Financial RPC 採 group → expense/settlement 的鎖序，在等待後重新驗證 actor，再計算可清償額。
- join_group 取得 group row lock；leave_group 遵循相同 group 鎖。邀請碼使用 pg_catalog 的 UUID 隨機位元，維持既有格式並移除 pgcrypto 安裝 schema 的依賴。
- `process-recurring` Edge 本體只允許精確的 service-role Bearer，不以「通過平台一般 JWT 驗證」代替管理授權。

## 套用前必須完成

1. 只讀比對 live schema、function body/signature/owner/ACL/search_path、RLS、migration history。不要呼叫 Vault helper 讀取秘密以作測試。
2. 確認 v3 及 `fix_settlement_reliability.sql` 的有效結構，尤其 `settlements.expense_id`、FK、partial unique、已結清刪除 guard。該舊檔的 get_group_balances 修正只有註解；本 migration 提供明確的純抵銷定義。
3. 確認全部使用中的客戶端以 RPC 新增／修改群組費用、建群／加入／離群及清償。舊 Vue 客戶端若仍直接寫群組表，需先完成相容性切換；不能盲目撤權。
4. 確認 RLS helper 的執行 owner 能繞過 group_members 的 RLS。Migration 會檢查此條件、function owner 與 RPC overload drift；遇到未知 policies 會停止，**不自動刪除陌生政策**。
5. 備份並在隔離、與正式版本相同的資料庫演練；核對應用角色、service_role、cron 和已部署 Edge 呼叫端。
6. 核准後僅執行本檔對應的 `v3-08-ledger-hardening.sql`。它在單一交易內更新 definitions／policies／grants，可重跑；若 SQL 工具保留失敗交易，先 `ROLLBACK` 再查原因。

禁止在 v3-08 後直接重播 v3-03／v3-04／舊結清 migration，否則可能覆蓋這批驗證與鎖。

## 測試

```sh
bun run test -- tests/database tests/process-recurring.spec.ts src/features/expense/api/__tests__/useAddExpense.spec.tsx
bun run typecheck
bun run lint
```

- `embedded-postgres@17.10.0-beta.17` 只作開發依賴；資料目錄使用系統 temp，隨機密碼，只監聽 loopback，不連 Supabase，不自動建立 OS 使用者。
- PostgreSQL 使用真實角色、RLS、函式、交易及兩條並行連線。Auth 僅使用測試 UUID／claims stub。
- 不啟用 pg_net／pg_cron，不送 FCM、不讀 Vault；這些平台整合仍需 staging 驗證。
- Bun 需要執行對應 `@embedded-postgres/<platform-arch>` 的 symlink postinstall。僅信任經檢查的對應套件；不要使用 `bun pm trust --all`。
- 跨平台與 CI 必須具備該平台的 native binary；root-only 環境不可為了測試任意建立系統使用者。

### 本機驗證結果

- 全量 Vitest：51 個檔案、285 個測試通過，包含真實 PostgreSQL 權限／並發、建群／加入／離群、migration 重跑與漂移拒絕測試。
- `typecheck`、`lint`、新增資料庫／Edge 測試及 `process-recurring` handler 的額外 ESLint、production build、`git diff --check` 均通過。
- 使用 macOS、Bun 1.3.14、Node 25.8.1；build 使用 dummy Supabase 環境值。與專案宣告的 Bun 1.4.2／Node 24 工具鏈不同，不能視為已通過該 CI matrix。
- Node 仍有 `--localstorage-file` 路徑警告。未執行瀏覽器 E2E、正式 migration 或 Edge 部署；平台整合與實際資料仍待獨立驗證。

## 明確未解決的事項

- 正式資料是否已受舊錯誤影響、歷史餘額／旗標修復，需另立資料修復計畫。
- 修改／撤銷清償後的旗標與 allocation 語義、部分付款後修改／刪除支出、多幣別帳本與整元化口徑，本批不擅自變更。
- `useDeleteExpense.ts` 的已結清群組費用 undo 仍有舊 best-effort 裸表補旗標路徑，收緊權限後會被拒絕。部署前必須確認既有刪除 guard 生效；不可把該路徑當作已支援的已結清／歷史帳務復原。此類復原需另訂原子 RPC 契約，而不是恢復裸表寫入權。
- group lock 目前序列化指定 financial RPC 與 membership RPC；**仍保留的直接 expense DELETE、週期產生器及管理者直接 SQL 不具完整共用鎖協定**。本批並發測試不能被描述為所有寫入入口已完全隔離。
- 相同請求序列重送仍需 LINE command／draft 的業務冪等鍵；mutex 並不是去重。
- profiles/settings 等未收錄的 live RLS、通知 outbox、月底週期日期、LINE 綁定／webhook／UI 不在本批實作。

## 回退

優先停用新入口並修正向前；保留合法帳務。不直接 restore 舊備份抹掉新交易，也不盲目恢復有越權風險的舊 policies。需回退時，使用預先審核且與 live 基準一致的 definitions／ACL 變更，在隔離環境驗證後再核准。

## 正式環境套用紀錄（2026-09-29）

**套用前的兩處修正**（在正式環境複本上被 preflight 擋下後補上）：

1. 正式環境的 RLS policy 使用描述性名稱（例如 `Authenticated users can create expenses`），不在原本的允許清單中。已逐條核對 22 條，加入允許清單並 `DROP`。
   若不移除，permissive policy 以 OR 合併，舊的寬鬆規則會讓收緊失效。
2. 正式環境沒有 `private` schema（只有 `schema.sql` 快照有），migration 開頭補 `CREATE SCHEMA IF NOT EXISTS private`。

**演練**：`supabase db dump` 取得正式環境 `group_expense`、`line_bot` 的 schema 與資料，載入同版本
`supabase/postgres:15.8.1.121` 容器（`auth.uid()`／`auth.role()` 對齊正式環境定義），套用兩次均成功。

**驗證**（演練與正式環境皆同）：

- 各群組餘額、簡化欠款、各帳本支出總額、每筆分帳總和、LINE Bot 查詢結果，套用前後 577 列完全相同。
- anon／authenticated 不能執行 `get_send_push_secret`、`process_recurring_expenses`、`create_monthly_snapshot`；
  以公開 anon key 經 REST 呼叫 `get_send_push_secret` 回 401。
- 非成員呼叫 `get_group_balances` 被拒；裸表新增群組費用被 RLS 拒絕；個人費用新增、`add_group_expense`（明確 splits）正常。
- LINE Bot 個人／群組確認入帳、查詢正常，身分切換有還原。
- cron（`monthly-report`、`process-recurring-expenses-daily`）以 `postgres` 執行，不受撤權影響。

**備份**：`~/Backups/couple-expense/2026-09-29-before-v3-08/`（schema、data、roles；權限 600，不在 repo）。

**已知影響**：`useDeleteExpense` 撤銷已結清群組費用時，補回 `is_settled` 的裸表更新會被拒（程式已容錯，不影響撤銷本身）。
