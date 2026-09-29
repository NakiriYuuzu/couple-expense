// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { HEIGHT, WIDTH, buttons, menuSvg, richMenuObject } from '../scripts/line-rich-menu/menu'
import { menuCommands } from '../supabase/functions/line-webhook/handler'

describe('LINE rich menu', () => {
    const menu = richMenuObject()

    it('sends exactly the commands the webhook understands', () => {
        expect(menu.areas.map(area => area.action.text).sort()).toEqual(Object.values(menuCommands).sort())
    })

    it('tiles the whole image without gaps or overlaps', () => {
        const covered = menu.areas.reduce((sum, { bounds }) => sum + bounds.width * bounds.height, 0)
        expect(covered).toBe(WIDTH * HEIGHT)
        for (const { bounds } of menu.areas) {
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(WIDTH)
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(HEIGHT)
        }
    })

    it('stays within LINE limits', () => {
        expect(menu.size).toEqual({ width: 2500, height: 1686 })
        expect(menu.chatBarText.length).toBeLessThanOrEqual(14)
        expect(menu.name.length).toBeLessThanOrEqual(300)
        for (const area of menu.areas) expect(area.action.label.length).toBeLessThanOrEqual(20)
    })

    it('renders every button into the SVG', () => {
        const svg = menuSvg()
        for (const button of buttons) {
            expect(svg).toContain(`>${button.text}</text>`)
            expect(svg).toContain(`>${button.subtitle}</text>`)
        }
    })
})
