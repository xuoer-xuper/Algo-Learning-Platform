// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { formatForDisplay } from '../../src/shared/time'
import { LearningOverviewPanel } from '../../src/features/settings/LearningOverviewPanel'
import { RealtimeSubmissionPanel } from '../../src/features/settings/RealtimeSubmissionPanel'
import { NoteList } from '../../src/features/problems/NoteList'
import { DashboardListsPanel } from '../../src/features/analytics/DashboardListsPanel'
import { computeCoachMetrics } from '../../src/features/coach/computeMetrics'
import { MOCK_EXPECTED, MOCK_METRICS_BUNDLE } from '../../src/features/coach/mockMetricsBundle'
import type { CoachMetricsBundle } from '../../src/shared/types/coach'

afterEach(cleanup)

describe('millisecond presentation', () => {
  it('should render epoch zero in overview, diagnostics, notes and timeline lists rather than missing placeholders', () => {
    const { container } = render(
      <>
        <LearningOverviewPanel
          stats={{ totalProblems: 1, todayVisited: 0, platformDistribution: [], lastActiveTime: 0 }}
        />
        <RealtimeSubmissionPanel
          status={{
            ipcRegistered: true,
            supportedAdapterIds: [],
            lastPage: { url: 'https://example.test', realtimeSupported: false, at: 0 },
          }}
          statusText=""
          onRefresh={() => {}}
        />
        <NoteList
          notes={[
            {
              id: 'note',
              title: 'Epoch note',
              content: '',
              note_type: 'solution',
              word_count: 0,
              updated_at: 0,
            },
          ]}
          activeNoteId={null}
          onOpenNote={() => {}}
          onDeleteNote={() => {}}
        />
        <DashboardListsPanel
          timeline={[{ id: 'event', event_type: 'visit', occurred_at: 0 }]}
          wrongProblems={[]}
          unreviewed={[]}
          revisits={[]}
          onNavigate={() => {}}
        />
      </>,
    )
    const expected = formatForDisplay(0)
    expect(container.querySelector('.stats-value-sm')?.textContent).toBe(expected)
    expect(container.querySelector('.realtime-status-detail')?.textContent).toContain(expected)
    expect(container.querySelector('.note-item-time')?.textContent).toBe(
      formatForDisplay(0, { second: undefined }),
    )
    expect(container.querySelector('.dashboard-timeline-time')?.textContent).toBe(expected)
  })

  it('should calculate epoch-zero AC and intervention instants numerically', () => {
    const template = MOCK_METRICS_BUNDLE.interventions[0]
    const bundle: CoachMetricsBundle = {
      since: -1000,
      until: 1000,
      events: [],
      interventions: [
        { ...template, intervention_id: 'epoch', problem_id: 'epoch', created_at: 0 },
      ],
      feedback: [],
      problem_ac_status: [{ problem_id: 'epoch', first_ac_at: 0 }],
    }
    expect(computeCoachMetrics(bundle).post_intervention_ac_count).toBe(1)
    expect(computeCoachMetrics(bundle).post_intervention_ac_rate).toBe(1)
  })

  it('should preserve the demonstration metrics after replacing string timestamps', () => {
    expect(computeCoachMetrics(MOCK_METRICS_BUNDLE, true)).toMatchObject(MOCK_EXPECTED)
    expect(typeof MOCK_METRICS_BUNDLE.since).toBe('number')
    expect(
      MOCK_METRICS_BUNDLE.interventions.every((item) => Number.isInteger(item.created_at)),
    ).toBe(true)
  })
})
