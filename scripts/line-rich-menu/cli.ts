// LINE 圖文選單工具。
//   bun scripts/line-rich-menu/cli.ts svg      產生 menu.svg（再用 render.sh 轉成 menu.png）
//   bun scripts/line-rich-menu/cli.ts deploy   建立選單、上傳 menu.png、設為預設，並刪除同名舊選單
// deploy 需要環境變數 LINE_CHANNEL_ACCESS_TOKEN；不要把 token 寫進檔案或指令歷史。
import { readFile, writeFile } from 'node:fs/promises'
import { MENU_NAME, menuSvg, richMenuObject } from './menu'

const directory = new URL('./', import.meta.url)

async function line(path: string, init: RequestInit & { host?: string } = {}) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
    if (!token) throw new Error('請設定 LINE_CHANNEL_ACCESS_TOKEN')
    const response = await fetch(`https://${init.host ?? 'api.line.me'}/v2/bot/${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...init.headers }
    })
    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → HTTP ${response.status}: ${await response.text()}`)
    const text = await response.text()
    return text ? JSON.parse(text) : {}
}

async function deploy() {
    const image = await readFile(new URL('menu.png', directory))
    if (image.byteLength > 1024 * 1024) throw new Error('menu.png 超過 LINE 的 1 MB 上限')

    const { richMenuId } = await line('richmenu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(richMenuObject())
    })
    await line(`richmenu/${richMenuId}/content`, {
        method: 'POST',
        host: 'api-data.line.me',
        headers: { 'Content-Type': 'image/png' },
        body: image
    })
    await line(`user/all/richmenu/${richMenuId}`, { method: 'POST' })
    console.log(`已設為預設選單：${richMenuId}`)

    const { richmenus } = await line('richmenu/list') as { richmenus: { richMenuId: string; name: string }[] }
    for (const menu of richmenus) {
        if (menu.name === MENU_NAME && menu.richMenuId !== richMenuId) {
            await line(`richmenu/${menu.richMenuId}`, { method: 'DELETE' })
            console.log(`已刪除舊選單：${menu.richMenuId}`)
        }
    }
}

const command = process.argv[2]
if (command === 'svg') {
    await writeFile(new URL('menu.svg', directory), menuSvg())
    console.log('已產生 scripts/line-rich-menu/menu.svg')
} else if (command === 'deploy') {
    await deploy()
} else {
    console.error('用法：bun scripts/line-rich-menu/cli.ts <svg|deploy>')
    process.exit(1)
}
