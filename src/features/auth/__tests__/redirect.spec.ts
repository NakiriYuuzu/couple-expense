import { describe, it, expect } from 'vitest'
import { sanitizeRedirect } from '../redirect'

describe('sanitizeRedirect（P3 開放式重導白名單）', () => {
    it('接受站內路徑', () => {
        expect(sanitizeRedirect('/expenses')).toBe('/expenses')
        expect(sanitizeRedirect('/groups/abc?tab=members')).toBe('/groups/abc?tab=members')
        expect(sanitizeRedirect('/')).toBe('/')
    })

    it('拒絕 protocol-relative 外部網址（//evil.com）', () => {
        expect(sanitizeRedirect('//evil.com')).toBeNull()
        expect(sanitizeRedirect('//evil.com/phish')).toBeNull()
    })

    it('拒絕絕對網址與非 / 開頭字串', () => {
        expect(sanitizeRedirect('https://evil.com')).toBeNull()
        expect(sanitizeRedirect('http://evil.com/x')).toBeNull()
        expect(sanitizeRedirect('javascript:alert(1)')).toBeNull()
        expect(sanitizeRedirect('dashboard')).toBeNull()
    })

    it('拒絕含反斜線的路徑（瀏覽器會把 \\ 正規化為 /）', () => {
        expect(sanitizeRedirect('/\\evil.com')).toBeNull()
        expect(sanitizeRedirect('/a\\b')).toBeNull()
    })

    it('拒絕空值', () => {
        expect(sanitizeRedirect('')).toBeNull()
        expect(sanitizeRedirect(null)).toBeNull()
        expect(sanitizeRedirect(undefined)).toBeNull()
    })
})
