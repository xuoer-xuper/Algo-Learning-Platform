import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  reviewRecommendationSchema,
  reviewRecommendationResultSchema,
  aiOutputRecordSchema,
} from '../../src/shared/types/ai'
import {
  browserDiagnosticsSnapshotSchema,
  managedDownloadResultSchema,
} from '../../src/shared/types/browser'
import {
  coachEventSchema,
  coachInterventionSchema,
  contestAuditRecordSchema,
  coachMetricsBundleSchema,
  coachFeedbackRecordSchema,
  problemVisitPointSchema,
  problemTimelineDataSchema,
  problemAcStatusSchema,
} from '../../src/shared/types/coach'
import { cookieSafeDomainSummarySchema } from '../../src/shared/types/cookies'
import { credentialSummarySchema } from '../../src/shared/types/credentials'
import { noteRecordSchema } from '../../src/shared/types/notes'
import {
  problemRecordSchema,
  problemDetailRecordSchema,
  omniboxSuggestionSchema,
} from '../../src/shared/types/problem'
import { platformAccountSchema, ratingHistoryRecordSchema } from '../../src/shared/types/rating'
import { pendingUserScriptInstallSchema } from '../../src/shared/types/scripts'
import {
  overviewStatsSchema,
  timelineEventSchema,
  trendPointSchema,
} from '../../src/shared/types/stats'
import {
  submissionRecordSchema,
  realtimeSubmissionStatusSchema,
} from '../../src/shared/types/submission'

const instantFields: Record<string, z.ZodType> = {
  'problem.lastVisited': problemRecordSchema.shape.last_visited_at,
  'problem.firstSeen': problemDetailRecordSchema.shape.first_seen_at,
  'omnibox.lastVisited': omniboxSuggestionSchema.shape.lastVisitedAt,
  'submission.submitted': submissionRecordSchema.shape.submitted_at,
  'overview.lastActive': overviewStatsSchema.shape.lastActiveTime,
  'timeline.occurred': timelineEventSchema.shape.occurred_at,
  'recommendation.lastAttempt': reviewRecommendationSchema.shape.source.shape.last_attempt,
  'recommendations.generated': reviewRecommendationResultSchema.shape.generated_at,
  'ai.created': aiOutputRecordSchema.shape.created_at,
  'note.updated': noteRecordSchema.shape.updated_at,
  'account.synced': platformAccountSchema.shape.last_synced_at,
  'rating.contest': ratingHistoryRecordSchema.shape.contest_at,
  'cookie.expiry': cookieSafeDomainSummarySchema.shape.earliest_expires_at,
  'credential.used': credentialSummarySchema.shape.lastUsedAt,
  'credential.created': credentialSummarySchema.shape.createdAt,
  'download.finished': managedDownloadResultSchema.shape.finishedAt,
  'diagnostic.at': browserDiagnosticsSnapshotSchema.shape.entries.element.shape.at,
  'install.created': pendingUserScriptInstallSchema.shape.createdAt,
  'realtime.page': realtimeSubmissionStatusSchema.shape.lastPage.unwrap().shape.at,
  'realtime.hook': realtimeSubmissionStatusSchema.shape.lastHook.unwrap().shape.at,
  'realtime.detection': realtimeSubmissionStatusSchema.shape.lastDetection.unwrap().shape.at,
  'coach.created': coachEventSchema.shape.created_at,
  'intervention.contestStart': coachInterventionSchema.shape.contest_start,
  'audit.exported': contestAuditRecordSchema.shape.exported_at,
  'metrics.since': coachMetricsBundleSchema.shape.since,
  'metrics.until': coachMetricsBundleSchema.shape.until,
  'feedback.created': coachFeedbackRecordSchema.shape.created_at,
  'visit.entered': problemVisitPointSchema.shape.entered_at,
  'visit.left': problemVisitPointSchema.shape.left_at,
  'problemTimeline.firstAc': problemTimelineDataSchema.shape.first_ac_at,
  'acStatus.firstAc': problemAcStatusSchema.shape.first_ac_at,
}

describe('cross-process instant schemas', () => {
  it.each(Object.entries(instantFields))(
    'should accept integer milliseconds including epoch zero for %s',
    (_name, schema) => {
      expect(schema.safeParse(0).success).toBe(true)
      expect(schema.safeParse(1_735_689_600_123).success).toBe(true)
      expect(schema.safeParse(-1).success).toBe(true)
      for (const invalid of ['2025-01-01T00:00:00.123Z', '1735689600123', 1.5, NaN, Infinity]) {
        expect(schema.safeParse(invalid).success).toBe(false)
      }
    },
  )

  it('should preserve day keys and nullable or optional timestamp contracts', () => {
    expect(trendPointSchema.safeParse({ local_day: '2026-01-15', count: 1 }).success).toBe(true)
    expect(trendPointSchema.safeParse({ local_day: 0, count: 1 }).success).toBe(false)
    expect(credentialSummarySchema.shape.lastUsedAt.safeParse(null).success).toBe(true)
    expect(problemDetailRecordSchema.shape.first_seen_at.safeParse(undefined).success).toBe(true)
    expect(noteRecordSchema.shape.updated_at.safeParse(null).success).toBe(false)
  })
})
