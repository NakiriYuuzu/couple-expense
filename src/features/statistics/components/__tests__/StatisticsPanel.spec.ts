import { describe, expect, it } from 'vitest'
import statisticsPanelSource from '../StatisticsPanel.vue?raw'

describe('StatisticsPanel', () => {
    it('includes chart legend items and axis hints', () => {
        expect(statisticsPanelSource).toContain('chartLegendItems')
        expect(statisticsPanelSource).toContain('{{ xAxisHint }}')
        expect(statisticsPanelSource).toContain('{{ yAxisHint }}')
    })

    it('formats x and y axis ticks for the area chart', () => {
        expect(statisticsPanelSource).toContain(':tick-format="formatXAxisTick"')
        expect(statisticsPanelSource).toContain(':tick-format="formatYAxisTick"')
    })
})
