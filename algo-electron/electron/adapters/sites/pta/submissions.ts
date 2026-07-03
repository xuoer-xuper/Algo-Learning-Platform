import type { SubmissionData } from '../../../shared/types'
import { pickFinalRealtimeSubmission } from '../../../submissions/realtimeSubmissionFilter'
import {
  createPtaRealtimeHookScript as createPtaScraperRealtimeHookScript,
  parsePtaFrontendVerdictPayload,
  parsePtaSubmissionData,
} from '../../../submissions/scrapers/ptaScraper'
import type { SubmissionDetectionPayload } from '../../types'

function getResponseRecord(raw: SubmissionDetectionPayload): Record<string, unknown> | null {
  return raw.response && typeof raw.response === 'object'
    ? raw.response as Record<string, unknown>
    : null
}

export function createPtaAdapterRealtimeHookScript(siteId: string): string {
  return createPtaScraperRealtimeHookScript(siteId)
}

export function parsePtaRealtimeSubmission(raw: SubmissionDetectionPayload): SubmissionData | null {
  const frontendSubmission = parsePtaFrontendVerdictPayload(raw)
  if (frontendSubmission) return frontendSubmission

  const response = getResponseRecord(raw)
  if (!response) return null
  return pickFinalRealtimeSubmission(parsePtaSubmissionData(raw.pageUrl, response))
}

export function readPtaProblemIdFromSubmission(submission: SubmissionData): string | null {
  try {
    const ptaProblemId = JSON.parse(submission.rawJson || '{}')?._ptaProblemId
    return typeof ptaProblemId === 'string' && ptaProblemId.trim()
      ? ptaProblemId.trim()
      : null
  } catch {
    return null
  }
}
