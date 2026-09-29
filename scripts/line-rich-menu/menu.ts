// LINE 圖文選單：版面、按鈕與圖片 SVG 的唯一來源。
// 按鈕送出的文字必須與 supabase/functions/line-webhook/handler.ts 的 menuCommands 一致（有測試檢查）。

type IconNode = [string, Record<string, string>][]

// Lucide 圖示路徑（lucide.dev，ISC License），與 App 使用的圖示相同。
const icons: Record<string, IconNode> = {
    pencilLine: [['path', { d: 'M13 21h8' }], ['path', { d: 'm15 5 4 4' }], ['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }]],
    bookOpen: [['path', { d: 'M12 5v16' }], ['path', { d: 'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z' }]],
    receiptText: [['path', { d: 'M13 16H8' }], ['path', { d: 'M14 8H8' }], ['path', { d: 'M16 12H8' }], ['path', { d: 'M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z' }]],
    chartColumn: [['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }], ['path', { d: 'M18 17V9' }], ['path', { d: 'M13 17V5' }], ['path', { d: 'M8 17v-3' }]],
    handCoins: [['path', { d: 'M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17' }], ['path', { d: 'm7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9' }], ['path', { d: 'm2 16 6 6' }], ['circle', { cx: '16',cy: '9',r: '2.9' }], ['circle', { cx: '6',cy: '5',r: '3' }]],
    circleHelp: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }], ['path', { d: 'M12 17h.01' }]]
}

export const MENU_NAME = 'couple-expense'
export const WIDTH = 2500
export const HEIGHT = 1686

const BRAND = '#777FE6'
const BRAND_TINT = '#E8ECFE'

export const buttons: { text: string; subtitle: string; icon: IconNode; primary?: boolean }[] = [
    { text: '記一筆', subtitle: '例：午餐 120', icon: icons.pencilLine, primary: true },
    { text: '帳本', subtitle: '個人／群組', icon: icons.bookOpen },
    { text: '最近紀錄', subtitle: '查看明細', icon: icons.receiptText },
    { text: '本月統計', subtitle: '分類支出', icon: icons.chartColumn },
    { text: '誰欠誰', subtitle: '群組欠款', icon: icons.handCoins },
    { text: '說明', subtitle: '使用方式', icon: icons.circleHelp }
]

const COLUMNS = 3
const ROWS = 2

function cell(index: number) {
    const column = index % COLUMNS
    const row = Math.floor(index / COLUMNS)
    const x = Math.round((WIDTH / COLUMNS) * column)
    const y = Math.round((HEIGHT / ROWS) * row)
    return {
        x,
        y,
        width: Math.round((WIDTH / COLUMNS) * (column + 1)) - x,
        height: Math.round((HEIGHT / ROWS) * (row + 1)) - y
    }
}

/** LINE Messaging API 的 rich menu 物件 */
export function richMenuObject() {
    return {
        size: { width: WIDTH, height: HEIGHT },
        selected: true,
        name: MENU_NAME,
        chatBarText: '記帳選單',
        areas: buttons.map((button, index) => ({
            bounds: cell(index),
            action: { type: 'message', label: button.text, text: button.text }
        }))
    }
}

function escapeXml(text: string) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function iconSvg(node: IconNode, x: number, y: number, size: number, color: string) {
    const scale = size / 24
    const children = node
        .map(([tag, attrs]) => {
            const attributes = Object.entries(attrs)
                .filter(([key]) => key !== 'key')
                .map(([key, value]) => `${key}="${escapeXml(value)}"`)
                .join(' ')
            return `<${tag} ${attributes}/>`
        })
        .join('')
    return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="2" `
        + `stroke-linecap="round" stroke-linejoin="round">${children}</g>`
}

export function menuSvg(fontFamily = 'PingFang TC') {
    const gap = 24
    const cards = buttons.map((button, index) => {
        const { x, y, width, height } = cell(index)
        const cardX = x + gap / 2 + (index % COLUMNS === 0 ? gap / 2 : 0)
        const cardY = y + gap / 2 + (index < COLUMNS ? gap / 2 : 0)
        const cardWidth = width - gap - (index % COLUMNS === 0 || index % COLUMNS === COLUMNS - 1 ? gap / 2 : 0)
        const cardHeight = height - gap - gap / 2
        const centerX = cardX + cardWidth / 2
        const fill = button.primary ? BRAND : '#FFFFFF'
        const circle = button.primary ? 'rgba(255,255,255,0.22)' : BRAND_TINT
        const iconColor = button.primary ? '#FFFFFF' : BRAND
        const titleColor = button.primary ? '#FFFFFF' : '#1F2340'
        const subtitleColor = button.primary ? 'rgba(255,255,255,0.85)' : '#8A8FA8'
        const iconCenterY = cardY + cardHeight * 0.36
        return [
            `<rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="48" fill="${fill}"/>`,
            `<circle cx="${centerX}" cy="${iconCenterY}" r="120" fill="${circle}"/>`,
            iconSvg(button.icon, centerX - 72, iconCenterY - 72, 144, iconColor),
            `<text x="${centerX}" y="${cardY + cardHeight * 0.72}" text-anchor="middle" font-family="${fontFamily}" `
                + `font-weight="600" font-size="112" fill="${titleColor}">${escapeXml(button.text)}</text>`,
            `<text x="${centerX}" y="${cardY + cardHeight * 0.86}" text-anchor="middle" font-family="${fontFamily}" `
                + `font-size="56" fill="${subtitleColor}">${escapeXml(button.subtitle)}</text>`
        ].join('\n')
    })
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">\n`
        + `<rect width="${WIDTH}" height="${HEIGHT}" fill="#F1F2F8"/>\n${cards.join('\n')}\n</svg>\n`
}
