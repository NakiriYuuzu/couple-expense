// LINE account link 的一次性 nonce：256 bits 隨機值，資料庫只存 SHA-256。

function toBase64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function createNonce(): string {
    return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashNonce(nonce: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)))
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}
