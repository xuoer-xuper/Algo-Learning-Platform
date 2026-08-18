import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('统计卡片组件治理', () => {
  it('Dashboard 与 Coach 指标卡统一消费 Card', () => {
    const dashboard = readSource('../../src/features/analytics/Dashboard.tsx')
    const coachMetrics = readSource('../../src/features/coach/CoachMetricsView.tsx')

    expect(dashboard.match(/<Card padded=\{false\} className="dashboard-card">/g)).toHaveLength(4)
    expect(coachMetrics.match(/<Card padded=\{false\} className="dashboard-card">/g)).toHaveLength(5)
    expect(dashboard).not.toContain('<div className="dashboard-card">')
    expect(coachMetrics).not.toContain('<div className="dashboard-card">')
  })

  it('首页与设置概览卡统一消费 Card 并保留原样式锚点', () => {
    const home = readSource('../../src/features/home/HomePage.tsx')
    const settings = readSource('../../src/features/settings/LearningOverviewPanel.tsx')

    expect(home.match(/<Card[^>]*className="home-stat-card">/g)).toHaveLength(3)
    expect(settings.match(/<Card padded=\{false\} className="stats-card(?: stats-card-wide)?">/g)).toHaveLength(3)
    expect(home).not.toContain('<div className="home-stat-card">')
    expect(settings).not.toMatch(/<div className="stats-card(?: stats-card-wide)?">/)
  })
})
