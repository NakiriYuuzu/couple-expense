import { describe, expect, it } from 'vitest'
import { changelog } from '@/shared/changelog'
import pkg from '../../../package.json'

describe('changelog', () => {
    it('contains well-formed entries with at least one section', () => {
        expect(changelog.length).toBeGreaterThan(0)

        for (const entry of changelog) {
            expect(entry.version.trim()).not.toBe('')
            expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            expect(entry.sections.length).toBeGreaterThan(0)

            for (const section of entry.sections) {
                expect(['added', 'changed', 'fixed', 'security']).toContain(section.type)
                expect(section.items.length).toBeGreaterThan(0)

                for (const item of section.items) {
                    expect(item.zhTW.trim()).not.toBe('')
                    expect(item.en.trim()).not.toBe('')
                }
            }
        }
    })

    it('orders entries by version and date descending', () => {
        const versionRank = (version: string) => version.split('.').map((part) => Number(part))

        for (let index = 1; index < changelog.length; index += 1) {
            const previous = changelog[index - 1]
            const current = changelog[index]
            const previousVersion = versionRank(previous.version)
            const currentVersion = versionRank(current.version)

            expect(previous.date >= current.date).toBe(true)
            expect(previousVersion[0] > currentVersion[0] || (
                previousVersion[0] === currentVersion[0]
                && (previousVersion[1] > currentVersion[1] || (
                    previousVersion[1] === currentVersion[1]
                    && previousVersion[2] >= currentVersion[2]
                ))
            )).toBe(true)
        }
    })

    it('starts with the package version', () => {
        // package.json is the release source of truth for the Settings version card.
        expect(changelog[0]?.version).toBe(pkg.version)
    })
})
