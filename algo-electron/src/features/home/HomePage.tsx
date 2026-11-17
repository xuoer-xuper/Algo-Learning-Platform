import { useIpcQuery } from '../../hooks/useIpcQuery'
import { useIpcQueryError } from '../../hooks/useIpcQueryError'
import {
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  PLATFORM_NAMES,
  PLATFORM_URLS,
  STATUS_COLORS,
  STATUS_LABELS,
} from '../../shared/display'
import {
  loadHomeOverviewStats,
  loadHomeRecentProblems,
  loadHomeRecommendations,
  loadHomeShortcuts,
} from './homeApi'
import { Card, Empty, ListRow, Skeleton } from '../../components/ui'

interface Props {
  onNavigate: (url: string) => void
}

export function HomePage({ onNavigate }: Props) {
  const statsQuery = useIpcQuery(loadHomeOverviewStats, [], {
    tables: ['problems', 'submissions', 'stats'],
  })
  const recentQuery = useIpcQuery(() => loadHomeRecentProblems(8), [], {
    tables: ['problems', 'submissions', 'stats'],
  })
  const recommendationQuery = useIpcQuery(() => loadHomeRecommendations(5), [], {
    tables: ['problems', 'submissions', 'stats'],
  })
  const shortcutQuery = useIpcQuery(loadHomeShortcuts, [])
  useIpcQueryError(statsQuery.error, '首页概览读取')
  useIpcQueryError(recentQuery.error, '首页最近题目读取')
  const stats = statsQuery.data
  const recent = recentQuery.data ?? []
  const recommendations = recommendationQuery.data ?? []
  const homeShortcuts = shortcutQuery.data ?? []

  const builtInUrls = new Set(Object.values(PLATFORM_URLS).map((url) => new URL(url).origin))
  const customShortcuts = homeShortcuts.flatMap((url) => {
    try {
      const parsed = new URL(url)
      if (builtInUrls.has(parsed.origin)) return []
      return [{ url, host: parsed.hostname.replace(/^www\./, '') }]
    } catch {
      return []
    }
  })

  return (
    <div className="home-page">
      <div className="home-header">
        {/* 品牌名降级为等宽小字肩标，主标题让位给一句克制的产品语 */}
        <div className="home-kicker num">Algo Learning Platform</div>
        <h1 className="home-title">今天刷点什么？</h1>
        <p className="home-subtitle">本地优先的算法学习记录平台，数据只存在你自己的磁盘上</p>
      </div>

      <div className="home-section">
        <h2 className="home-section-title">快捷入口</h2>
        <div className="home-sites">
          {/*
            卡片磁贴刻意不走 ui/Button：.ui-btn 是单行内联标签的底座
            （justify-content: center + white-space: nowrap + 固定高度），
            套上来要再写四条声明去撤销它，反而更难读。这里只补 type="button"
            —— 那是走 Button 唯一能拿到的实质收益。
          */}
          {Object.entries(PLATFORM_URLS).map(([key, url]) => (
            <button
              key={key}
              type="button"
              className="home-site-btn"
              onClick={() => onNavigate(url)}
            >
              {/* 平台色圆点必须与等宽短标签成对出现（display.ts 约定） */}
              <span className="home-site-head">
                <span className="home-site-dot" style={{ backgroundColor: PLATFORM_COLORS[key] }} />
                <span className="home-site-label num">{PLATFORM_LABELS[key] || key}</span>
              </span>
              <span className="home-site-name">{PLATFORM_NAMES[key]}</span>
              <span className="home-site-url num">
                {url.replace('https://', '').replace(/\/$/, '')}
              </span>
            </button>
          ))}
          {customShortcuts.map(({ url, host }) => (
            <button
              key={url}
              type="button"
              className="home-site-btn"
              onClick={() => onNavigate(url)}
            >
              <span className="home-site-head">
                <span
                  className="home-site-dot"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                />
                <span className="home-site-label num">URL</span>
              </span>
              <span className="home-site-name">{host}</span>
              <span className="home-site-url num">
                {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/*
        加载中出骨架而不是留空：改前这块在 stats 到达前完全不渲染，首页会先短暂
        少一整段，然后概览"弹"出来。骨架把高度先占住。
      */}
      {statsQuery.isLoading && (
        <div className="home-section">
          <h2 className="home-section-title">学习概览</h2>
          <Skeleton rows={2} label="学习概览加载中" />
        </div>
      )}

      {/*
        `stats.totalProblems === 0` 才是真空态 —— 与上面的 `statsQuery.isLoading`
        分成两个分支，是这一版三态词汇的关键：先前两者都可能显示成"没有记录"。
      */}
      {stats && stats.totalProblems === 0 && (
        <Empty
          icon="chart"
          className="home-empty"
          hint="从上方快捷入口打开一个站点，浏览过的题目会自动记录在这里"
        >
          还没有学习记录
        </Empty>
      )}

      {stats && stats.totalProblems > 0 && (
        <div className="home-section">
          <h2 className="home-section-title">学习概览</h2>
          <div className="home-stats">
            <Card padded={false} className="home-stat-card">
              <div className="home-stat-value num">{stats.totalProblems}</div>
              <div className="home-stat-label">总题数</div>
            </Card>
            <Card padded={false} className="home-stat-card">
              <div className="home-stat-value num">{stats.todayVisited}</div>
              <div className="home-stat-label">今日访问</div>
            </Card>
            {stats.platformDistribution.map((p) => (
              <Card key={p.platform} padded={false} className="home-stat-card">
                <div className="home-stat-value num">{p.count}</div>
                <div className="home-stat-label">
                  <span
                    className="home-stat-dot"
                    style={{ backgroundColor: PLATFORM_COLORS[p.platform] }}
                  />
                  <span className="num">{PLATFORM_LABELS[p.platform] || p.platform}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="home-section">
          <h2 className="home-section-title">今日复习建议</h2>
          <div className="home-recommendations">
            {recommendations.map((r) => (
              // 行改为 ui/ListRow：原先裸 `<div onClick>`，键盘到不了
              <ListRow
                key={r.problem_id}
                className="home-rec-item"
                onActivate={() => onNavigate(r.canonical_url)}
                label={`打开 ${r.title || r.platform_problem_id}`}
              >
                <span
                  className="home-rec-dot"
                  style={{ backgroundColor: PLATFORM_COLORS[r.platform] }}
                />
                <span className="home-rec-platform num">
                  {PLATFORM_LABELS[r.platform] || r.platform}
                </span>
                <span className="home-rec-title">{r.title || r.platform_problem_id}</span>
                <span className="home-rec-evidence">
                  <span className="num">{r.source.wrong_count}</span> 次错误 ·{' '}
                  <span className="num">{r.source.days_since_attempt}</span> 天未复习
                </span>
              </ListRow>
            ))}
          </div>
        </div>
      )}

      {recentQuery.isLoading && (
        <div className="home-section">
          <h2 className="home-section-title">最近访问</h2>
          <Skeleton rows={4} label="最近访问加载中" />
        </div>
      )}

      {recent.length > 0 && (
        <div className="home-section">
          <h2 className="home-section-title">最近访问</h2>
          <div className="home-recent">
            {recent.map((p) => (
              <ListRow
                key={p.id}
                className="home-recent-item"
                onActivate={() => onNavigate(p.canonical_url)}
                label={`打开 ${p.title || p.platform_problem_id}`}
              >
                <span
                  className="home-recent-dot"
                  style={{ backgroundColor: STATUS_COLORS[p.status] || STATUS_COLORS.unknown }}
                />
                <span className="home-recent-platform num">
                  {PLATFORM_LABELS[p.platform] || p.platform}
                </span>
                <span className="home-recent-title">{p.title || p.platform_problem_id}</span>
                {/* 状态色圆点与文字成对出现（display.ts 约定） */}
                <span
                  className="home-recent-status"
                  style={{ color: STATUS_COLORS[p.status] || STATUS_COLORS.unknown }}
                >
                  {STATUS_LABELS[p.status] || p.status}
                </span>
              </ListRow>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
