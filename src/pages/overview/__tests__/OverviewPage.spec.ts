import { describe, expect, it } from 'vitest'
import overviewPageSource from '../OverviewPage.vue?raw'

describe('OverviewPage', () => {
    it('renders only the statistics panel on first load', () => {
        expect(overviewPageSource).toContain('<StatisticsPanel v-if="activePanel === \'statistics\'" />')
        expect(overviewPageSource).toContain('<DebtPanel v-else />')
    })

    it('does not keep both panels in a translated track', () => {
        expect(overviewPageSource).not.toContain('translateX(')
        expect(overviewPageSource).not.toContain("width: '200%'")
        expect(overviewPageSource).not.toContain('100vw')
    })
})
