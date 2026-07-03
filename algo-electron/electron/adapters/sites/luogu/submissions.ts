import type { SubmissionData } from '../../../shared/types'
import { pickFinalRealtimeSubmission } from '../../../submissions/realtimeSubmissionFilter'
import { EXTRACT_LUOGU_SUBMISSIONS_SCRIPT, parseLuoguSubmissionData } from '../../../submissions/scrapers/luoguScraper'
import { createScriptedRealtimeHookScript } from '../../../submissions/scriptedRealtimeHook'
import type { SubmissionDetectionPayload } from '../../types'

function getResponseRecord(raw: SubmissionDetectionPayload): Record<string, unknown> | null {
  return raw.response && typeof raw.response === 'object'
    ? raw.response as Record<string, unknown>
    : null
}

export function parseLuoguRawProblemInfo(submission: SubmissionData): { problemId?: string; title?: string } {
  try {
    const raw = JSON.parse(submission.rawJson || '{}')
    return {
      problemId: typeof raw?._luoguProblemId === 'string' && raw._luoguProblemId.trim()
        ? raw._luoguProblemId.trim()
        : undefined,
      title: typeof raw?._luoguProblemTitle === 'string' && raw._luoguProblemTitle.trim()
        ? raw._luoguProblemTitle.trim()
        : undefined,
    }
  } catch {
    return {}
  }
}

const LUOGU_REALTIME_READY_SCRIPT = `((data) => {
  const mapStatus = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && /^\\d+$/.test(value.trim())) return Number(value.trim());
    const text = String(value || '').toLowerCase();
    if (/waiting|judging|running|pending|评测中|等待/.test(text)) return 1;
    if (/accepted|答案正确|通过|\\bac\\b/.test(text)) return 12;
    if (/compile|编译/.test(text)) return 2;
    if (/wrong|答案错误|unaccepted|部分正确/.test(text)) return 6;
    if (/time/.test(text) || /时间/.test(text)) return 5;
    if (/memory/.test(text) || /内存/.test(text)) return 4;
    if (/runtime|运行错误/.test(text)) return 7;
    if (/output|输出/.test(text)) return 3;
    return -1;
  };
  const hasDetail = (record) => ['detail', 'details', 'judgeResult', 'testCases', 'testcases', 'subtasks', 'cases', 'points']
    .some((key) => {
      const value = record && record[key];
      if (Array.isArray(value)) return value.length > 0;
      return value && typeof value === 'object' && Object.keys(value).length > 0;
    });
  const hasPendingDetail = (value, depth = 0) => {
    if (!value || depth > 8) return false;
    if (Array.isArray(value)) return value.some((item) => hasPendingDetail(item, depth + 1));
    if (typeof value !== 'object') return false;
    const status = mapStatus(value.status ?? value.verdict ?? value.result ?? value.judgeResult);
    if (status === 0 || status === 1) return true;
    return ['testCases', 'testcases', 'cases', 'points', 'subtasks', 'details', 'detail', 'results', 'result']
      .some((key) => hasPendingDetail(value[key], depth + 1));
  };
  const isRecordReady = (record) => {
    if (!record || !record.id) return false;
    const aggregate = mapStatus(record.status);
    if (aggregate === 0 || aggregate === 1 || aggregate < 0) return false;
    if (aggregate === 2) return true;
    // Luogu may expose an aggregate final status while testcase rows are still
    // loading, so realtime capture waits until details exist and none are pending.
    if (hasPendingDetail(record)) return false;
    return hasDetail(record);
  };
  const records = data && data.record
    ? [data.record]
    : Array.isArray(data && data.records)
      ? data.records
      : [];
  return records.length > 0 && isRecordReady(records[0]);
})`

export function createLuoguRealtimeHookScript(siteId: string): string {
  return createScriptedRealtimeHookScript(siteId, EXTRACT_LUOGU_SUBMISSIONS_SCRIPT, LUOGU_REALTIME_READY_SCRIPT)
}

export function parseLuoguRealtimeSubmission(raw: SubmissionDetectionPayload): SubmissionData | null {
  const response = getResponseRecord(raw)
  if (!response) return null
  return pickFinalRealtimeSubmission(parseLuoguSubmissionData(response, { requireRealtimeReady: true }))
}
