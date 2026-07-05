// Edge Function: send-push
//
// 用途：接收 { userIds, event, title, body, data? }，依 notification_prefs 過濾收件人後，
// 對每個收件人名下所有裝置（group_expense.user_devices）逐一透過 FCM HTTP v1 送出推播。
//
// 呼叫端限定：這支 function 只該被 DB trigger（pg_net，見 migrations/v3-06-notification-triggers.sql）
// 與 cron 呼叫，不對 client 開放。Supabase 平台預設 verify_jwt = true（未見 supabase/config.toml
// 覆寫此設定）：任何請求若沒有合法 Supabase JWT 掛在 Authorization，會在抵達這裡之前就被平台
// 閘道擋下（401 UNAUTHORIZED_NO_AUTH_HEADER），function 本體完全不會執行、isAuthorized() 根本
// 不會被呼叫到。因此驗證實際只有一條主線會生效：
//   (a) Authorization: Bearer <service_role key>——trigger 端從 Supabase Vault 讀出
//       send_push_service_key（值即專案 service_role key，legacy JWT 格式，可通過平台
//       verify_jwt）帶上；過平台層驗證後，本檔 isAuthorized() 再逐字比對是否等於
//       SUPABASE_SERVICE_ROLE_KEY，藉此把能通過平台驗證的 anon/一般使用者 JWT 擋在外面
//       （平台只驗簽章、不分角色）。
//   (b) x-webhook-secret 標頭比對 SEND_PUSH_WEBHOOK_SECRET——僅作為 (a) 之外的次要防線
//       與 (a) 在 isAuthorized() 中是 OR 關係：任一條件成立即可授權通過（Authorization
//       或 x-webhook-secret）。若 service_role key 外洩，Authorization 單獨就可通過；x-webhook-secret
//       並不會在其外洩時再形成額外阻擋層；同時也不再是雙人雙要素式防禦。
//       在預設 verify_jwt = true 下，若請求同時缺少合法 Authorization，仍會在平台層被擋下，
//       不會執行到這裡——只有日後改為 verify_jwt = false 開放外部呼叫端時，才會單獨依賴這條路徑。
//
// FCM UNREGISTERED / NOT_FOUND 回應 → 視為殭屍裝置，以 service_role 權限刪除該
// user_devices 列（呼應 migrations/v3-01-user-devices.sql 訂下的清理責任）。
//
// 環境變數：
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   — Supabase 平台自動注入，免手動設定
//   FCM_PROJECT_ID                             — Firebase 專案 ID
//   FCM_SERVICE_ACCOUNT_JSON                   — service account 完整 JSON（優先採用）
//   FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY          — 拆欄位版本（FCM_SERVICE_ACCOUNT_JSON 未設時的備援）
//   SEND_PUSH_WEBHOOK_SECRET                   — 見上方驗證雙軌 (b)
//
// 設定步驟見 docs/fcm-setup.md。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type NotificationEvent = 'split_assigned' | 'settlement_received' | 'monthly_report'

const NOTIFICATION_EVENTS: NotificationEvent[] = ['split_assigned', 'settlement_received', 'monthly_report']

interface SendPushPayload {
    userIds: string[]
    event: NotificationEvent
    title: string
    body: string
    data?: Record<string, string>
}

function isValidPayload(value: unknown): value is SendPushPayload {
    if (!value || typeof value !== 'object') return false
    const v = value as Record<string, unknown>
    return (
        Array.isArray(v.userIds) &&
        v.userIds.length > 0 &&
        v.userIds.every((id) => typeof id === 'string') &&
        typeof v.event === 'string' &&
        NOTIFICATION_EVENTS.includes(v.event as NotificationEvent) &&
        typeof v.title === 'string' && v.title.length > 0 &&
        typeof v.body === 'string' && v.body.length > 0 &&
        (v.data === undefined || (typeof v.data === 'object' && v.data !== null))
    )
}

// ---- 呼叫端驗證 --------------------------------------------------------------

function isAuthorized(req: Request, supabaseServiceKey: string): boolean {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (authHeader === `Bearer ${supabaseServiceKey}`) {
        return true
    }

    const webhookSecret = Deno.env.get('SEND_PUSH_WEBHOOK_SECRET')
    if (!webhookSecret) return false
    return req.headers.get('x-webhook-secret') === webhookSecret
}

// ---- Google OAuth（RS256 JWT，Deno 原生 crypto.subtle，不引第三方套件）--------
// 備選方案：deno.land/x/djwt 這類輕量 JWT 套件也能完成同樣的簽章，但原生 crypto.subtle
// 已足以簽發 Google service account 的 RS256 JWT，零額外相依，故採此。

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToPkcs8(pem: string): ArrayBuffer {
    const base64 = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s/g, '')
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
}

async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'pkcs8',
        pemToPkcs8(privateKeyPem),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    )

    const now = Math.floor(Date.now() / 1000)
    const header = { alg: 'RS256', typ: 'JWT' }
    const claims = {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }

    const encoder = new TextEncoder()
    const unsigned = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned))
    const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`

    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    })

    if (!resp.ok) {
        throw new Error(`Google OAuth token exchange failed: ${resp.status} ${await resp.text()}`)
    }

    const json = await resp.json()
    return json.access_token as string
}

// ---- FCM HTTP v1 --------------------------------------------------------------

interface FcmSendResult {
    ok: boolean
    unregistered: boolean
}

async function sendFcmMessage(
    accessToken: string,
    projectId: string,
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>
): Promise<FcmSendResult> {
    const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: {
                token,
                // data-only message（刻意不帶 notification 欄位）：帶 notification 會讓 FCM SDK
                // 在背景自動顯示一則系統通知，sw.ts 的 onBackgroundMessage 又會呼叫
                // showNotification() 顯示第二則，變成每次推播雙通知。title/body 併入 data，
                // 交由 sw.ts 以 payload.data.title/body/url 建構唯一的通知。
                // FCM 要求 data 的 value 一律為字串；防呼叫端傳非字串值導致整包被 FCM 拒絕。
                data: Object.fromEntries(
                    Object.entries({ ...data, title, body }).map(([k, v]) => [k, String(v)])
                )
            }
        })
    })

    if (resp.ok) {
        return { ok: true, unregistered: false }
    }

    const errorJson = await resp.json().catch(() => null)
    console.error('FCM send failed:', resp.status, JSON.stringify(errorJson))

    const errorCode = errorJson?.error?.details?.find(
        (d: Record<string, unknown>) => typeof d['@type'] === 'string' && (d['@type'] as string).includes('FcmError')
    )?.errorCode
    const status = errorJson?.error?.status

    const unregistered = errorCode === 'UNREGISTERED' || status === 'NOT_FOUND'
    return { ok: false, unregistered }
}

// ---- Handler --------------------------------------------------------------

Deno.serve(async (req: Request) => {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const fcmProjectId = Deno.env.get('FCM_PROJECT_ID')
        const serviceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')
        const clientEmailEnv = Deno.env.get('FCM_CLIENT_EMAIL')
        const privateKeyEnv = Deno.env.get('FCM_PRIVATE_KEY')

        if (!supabaseUrl || !supabaseServiceKey || !fcmProjectId) {
            return new Response(
                JSON.stringify({ error: 'Missing environment variables' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }

        if (!isAuthorized(req, supabaseServiceKey)) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
        }

        let clientEmail: string
        let privateKey: string
        if (serviceAccountJson) {
            const parsed = JSON.parse(serviceAccountJson)
            clientEmail = parsed.client_email
            privateKey = parsed.private_key
        } else if (clientEmailEnv && privateKeyEnv) {
            clientEmail = clientEmailEnv
            privateKey = privateKeyEnv.replace(/\\n/g, '\n')
        } else {
            return new Response(
                JSON.stringify({ error: 'Missing FCM service account credentials' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }

        const payload = await req.json().catch(() => null)
        if (!isValidPayload(payload)) {
            return new Response(
                JSON.stringify({ error: 'Invalid payload' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            db: { schema: 'group_expense' }
        })

        // 1) 依 notification_prefs 過濾收件人：明確關閉該事件者才排除；查無設定列（尚未建立
        //    user_settings）視為預設全開（呼應 v3-05 的欄位預設值）。
        const { data: settingsRows, error: settingsError } = await supabase
            .from('user_settings')
            .select('user_id, notification_prefs')
            .in('user_id', payload.userIds)

        if (settingsError) {
            console.error('user_settings query error:', settingsError)
            return new Response(
                JSON.stringify({ error: settingsError.message }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }

        const optedOut = new Set(
            (settingsRows ?? [])
                .filter((row: { user_id: string; notification_prefs: Record<string, unknown> }) => row.notification_prefs?.[payload.event] === false)
                .map((row: { user_id: string }) => row.user_id)
        )
        const recipientIds = payload.userIds.filter((id) => !optedOut.has(id))
        const skippedByPrefs = payload.userIds.length - recipientIds.length

        if (recipientIds.length === 0) {
            return new Response(
                JSON.stringify({ sent: 0, failed: 0, unregisteredRemoved: 0, skippedByPrefs }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // 2) 撈每個收件人名下全部裝置 token
        const { data: devices, error: devicesError } = await supabase
            .from('user_devices')
            .select('id, fcm_token')
            .in('user_id', recipientIds)

        if (devicesError) {
            console.error('user_devices query error:', devicesError)
            return new Response(
                JSON.stringify({ error: devicesError.message }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }

        if (!devices || devices.length === 0) {
            return new Response(
                JSON.stringify({ sent: 0, failed: 0, unregisteredRemoved: 0, skippedByPrefs }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // 3) 換一次 Google access token，逐裝置發送
        const accessToken = await getGoogleAccessToken(clientEmail, privateKey)

        let sent = 0
        let failed = 0
        const staleDeviceIds: string[] = []

        for (const device of devices as { id: string; fcm_token: string }[]) {
            const result = await sendFcmMessage(
                accessToken,
                fcmProjectId,
                device.fcm_token,
                payload.title,
                payload.body,
                payload.data
            )
            if (result.ok) {
                sent++
            } else {
                failed++
                if (result.unregistered) {
                    staleDeviceIds.push(device.id)
                }
            }
        }

        // 4) 清理殭屍 token（UNREGISTERED / NOT_FOUND）— service_role 權限，繞過 RLS own-rows 限制
        if (staleDeviceIds.length > 0) {
            const { error: deleteError } = await supabase
                .from('user_devices')
                .delete()
                .in('id', staleDeviceIds)

            if (deleteError) {
                console.error('user_devices cleanup error:', deleteError)
            }
        }

        return new Response(
            JSON.stringify({ sent, failed, unregisteredRemoved: staleDeviceIds.length, skippedByPrefs }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('Unexpected error:', message)
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
})
