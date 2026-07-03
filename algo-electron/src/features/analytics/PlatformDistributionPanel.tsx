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

interface PlatformDistributionItem {
  platform: string
  count: number
}

interface PlatformChartItem {
  name: string
  value: number
  color: string
}

interface PlatformDistributionPanelProps {
  distribution: PlatformDistributionItem[]
}

export function PlatformDistributionPanel({ distribution }: PlatformDistributionPanelProps) {
  const platformData: PlatformChartItem[] = distribution.map((item, index) => ({
    name: PLATFORM_NAMES[item.platform] || item.platform,
    value: item.count,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))

  if (platformData.length === 0) return null

  return (
    <div className="dashboard-chart-section">
      <h3 className="dashboard-section-title">平台分布</h3>
      <div className="dashboard-chart-row">
        <div className="dashboard-chart-pie">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <Pie data={platformData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65}
                label={({ name, value }: any) => `${name} ${value}`}
                labelLine={{ strokeWidth: 1 }}>
                {platformData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="dashboard-chart-bar">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={platformData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
