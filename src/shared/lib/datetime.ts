// 時間唯一真相模組（Q6 裁定）：
//   - 儲存一律 UTC（timestamptz）
//   - 顯示與分桶（月/週/日）一律以 Asia/Taipei 計算
//   - 與裝置時區 / process.env.TZ 完全無關（只用 Intl API，不引入任何 runtime 相依）
// 目的：出國記帳不飄日、月報邊界穩定、根除「toISOString().slice()」式的裝置時區 bug。

export const APP_TZ = 'Asia/Taipei'

interface WallParts {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
}

// 取得某個 UTC 時刻在 Taipei 的「牆上時鐘」年月日時分秒（純 Intl，與裝置時區無關）
function taipeiWallParts(instant: Date): WallParts {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: APP_TZ,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    })

    const map: Record<string, string> = {}
    for (const part of dtf.formatToParts(instant)) {
        if (part.type !== 'literal') map[part.type] = part.value
    }

    // 部分 runtime 在午夜會回傳 hour='24'，一律正規化為 0
    let hour = Number(map.hour)
    if (hour === 24) hour = 0

    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        hour,
        minute: Number(map.minute),
        second: Number(map.second)
    }
}

// 求某個 UTC 時刻的 Taipei offset（毫秒，東為正）。Taipei 無 DST，恆為 +8h，
// 但仍以 Intl 反推而非硬編碼，維持「只用 Intl」與未來時區規則變動的韌性。
function taipeiOffsetMs(instant: Date): number {
    const p = taipeiWallParts(instant)
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    return asIfUtc - instant.getTime()
}

// 將一組「Taipei 牆上時間」欄位換算成對應的 UTC 時刻
function taipeiWallToUtc(
    year: number,
    monthIndex: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    ms = 0
): Date {
    const guess = Date.UTC(year, monthIndex, day, hour, minute, second, ms)
    const offset = taipeiOffsetMs(new Date(guess))
    return new Date(guess - offset)
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

// 任一 UTC 時刻 → Taipei 日曆日 'YYYY-MM-DD'（預設為現在）
export function taipeiDateString(instant: Date = new Date()): string {
    const p = taipeiWallParts(instant)
    return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

// Taipei 當前月份 'YYYY-MM'
export function currentYearMonth(): string {
    const p = taipeiWallParts(new Date())
    return `${p.year}-${pad2(p.month)}`
}

// Taipei 月界換算成 UTC 半開區間 [start, end)，供 timestamptz 查詢（含頭不含尾）
export function monthRangeUtc(yearMonth: string): [Date, Date] {
    const [yearStr, monthStr] = yearMonth.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr) // 1-based

    const start = taipeiWallToUtc(year, month - 1, 1)
    const end = taipeiWallToUtc(year, month, 1)
    return [start, end]
}

// 該時刻所屬 Taipei 週的「週一」日曆日 'YYYY-MM-DD'（週界以 Taipei 計）
export function weekStart(instant: Date = new Date()): string {
    const p = taipeiWallParts(instant)
    // 以 Taipei 日曆日建構純日期（UTC 方法運算，與裝置時區無關）
    const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() // 0=Sun..6=Sat
    const diff = dow === 0 ? 6 : dow - 1
    const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - diff))
    return `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`
}

// 以 Intl + APP_TZ 顯示時間。未指定格式時採「YYYY/MM/DD HH:mm（24h, Taipei）」預設。
//
// 預期輸入：完整 ISO timestamptz 字串（含時間與時區，如 '2026-06-30T16:30:00Z'）或 Date 物件。
//
// 注意（date-only 陷阱）：date-only 字串（'YYYY-MM-DD'）會被 JS `new Date()` 當成
// UTC 午夜解析，換算到 Asia/Taipei 顯示時 +8h 會落到「該日 08:00」甚至跨日，造成日期偏移。
// 只需顯示日曆日時請改走 taipeiDateString，勿把 date-only 字串丟進本函式。
//
// 韌性：無法解析的輸入（invalid string / invalid Date）回傳 ''，不再讓 Intl.format 丟 RangeError。
export function formatDateTime(
    instant: Date | string,
    opts: Intl.DateTimeFormatOptions & { locale?: string } = {}
): string {
    const date = typeof instant === 'string' ? new Date(instant) : instant

    // 無法解析 → 回傳空字串，避免 Intl.DateTimeFormat.format 對 invalid Date 丟 RangeError
    if (isNaN(date.getTime())) return ''

    const { locale = 'zh-TW', ...format } = opts

    const hasFormat = Object.keys(format).length > 0
    const options: Intl.DateTimeFormatOptions = hasFormat
        ? { ...format, timeZone: APP_TZ }
        : {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: APP_TZ
          }

    return new Intl.DateTimeFormat(locale, options).format(date)
}
