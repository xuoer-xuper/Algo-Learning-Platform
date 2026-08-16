import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART_COLORS, PLATFORM_NAMES } from '../../shared/display'
import type { PlatformDistributionItem } from './types'

interface PlatformChartItem {
  name: string
  value: number
  color: string
}

interface PlatformDistributionPanelProps {
  distribution: PlatformDistributionItem[]
}

/** 超出色板槽位的平台并入「其他」，用中性墨色（dataviz 规范：禁止取模循环生成新色） */
const OTHER_SERIES_COLOR = 'var(--color-ink-3)'

export function PlatformDistributionPanel({ distribution }: PlatformDistributionPanelProps) {
  // 系列色按 CHART_COLORS 槽位固定分配：前 6 个平台各占一槽
  const platformData: PlatformChartItem[] = distribution.slice(0, CHART_COLORS.length).map((item, index) => ({
    name: PLATFORM_NAMES[item.platform] || item.platform,
    value: item.count,
    color: CHART_COLORS[index],
  }))

  // 第 7 个及以后的平台累加并入「其他」（用循环累加，避免新增函数）
  let otherTotal = 0
  for (const item of distribution.slice(CHART_COLORS.length)) otherTotal += item.count
  if (otherTotal > 0) platformData.push({ name: '其他', value: otherTotal, color: OTHER_SERIES_COLOR })

  if (platformData.length === 0) return null

  return (
    <div className="dashboard-chart-section">
      <h3 className="dashboard-section-title">平台分布</h3>
      <div className="dashboard-chart-row">
        <div className="dashboard-chart-pie">
          <div className="dashboard-chart-pie-figure">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                {/* 扇区之间用卡片底色描边留出间隙（dataviz 饼图规范） */}
                <Pie data={platformData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72}
                  stroke="var(--bg-card)" strokeWidth={2} isAnimationActive={false}>
                  {platformData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="dashboard-platform-legend">
            {platformData.map((item) => (
              <div className="dashboard-platform-legend-item" key={item.name}>
                <span className="dashboard-platform-legend-swatch" style={{ backgroundColor: item.color }} />
                <span className="dashboard-platform-legend-name">{item.name}</span>
                <span className="dashboard-platform-legend-value num">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="dashboard-chart-bar">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={platformData}>
              <XAxis dataKey="name" stroke="var(--border-light)" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <YAxis stroke="var(--border-light)" width={32} allowDecimals={false}
                tick={{ fontSize: 12, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }} />
              <Tooltip cursor={{ fill: 'var(--hover-bg)' }} />
              {/* 柱色与饼图共用同一实体→槽位映射（色随实体，不随排名） */}
              <Bar dataKey="value" name="题数" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                {platformData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
