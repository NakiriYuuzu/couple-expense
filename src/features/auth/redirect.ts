// redirect 參數白名單（修 P3 開放式重導）：
// 僅接受站內路徑——必須以單一 '/' 開頭，且不得以 '//' 開頭（'//evil.com' 會被瀏覽器
// 當成 protocol-relative 外部網址）。任何 'http(s)://…' / '//…' 一律拒絕回傳 null。
export function sanitizeRedirect(raw: string | null | undefined): string | null {
    if (typeof raw !== 'string') return null
    if (raw.length === 0) return null
    if (!raw.startsWith('/')) return null
    if (raw.startsWith('//')) return null
    // 縱深防禦：瀏覽器會把 '\' 正規化為 '/'，'/\evil.com' 在整頁導航下等同 '//evil.com'
    if (raw.includes('\\')) return null
    return raw
}
