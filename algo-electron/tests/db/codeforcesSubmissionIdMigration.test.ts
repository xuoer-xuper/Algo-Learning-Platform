import assert from 'node:assert'
import { normalizeCodeforcesSubmissionIds } from '../../electron/db/migrations/018_normalize_codeforces_submission_ids.ts'

interface SubmissionRow {
  id: string
  problem_id: string | null
  platform: string
  platform_submission_id: string
  verdict: string
  raw_verdict: string | null
  language: string | null
  submitted_at: string
  runtime_ms: number | null
  memory_kb: number | null
  source_url: string | null
  raw_json: string | null
  created_at: string
  updated_at: string
}

const rows: SubmissionRow[] = [
  {
    id: 'numeric-only',
    problem_id: 'problem-1',
    platform: 'codeforces',
    platform_submission_id: '123456',
    verdict: 'AC',
    raw_verdict: 'OK',
    language: 'GNU C++17',
    submitted_at: '2026-07-01T10:00:00+08:00',
    runtime_ms: 46,
    memory_kb: 1024,
    source_url: 'https://codeforces.com/contest/1900/submission/123456',
    raw_json: '{"from":"api"}',
    created_at: '2026-07-01T10:00:00+08:00',
    updated_at: '2026-07-01T10:00:00+08:00',
  },
  {
    id: 'prefixed',
    problem_id: null,
    platform: 'codeforces',
    platform_submission_id: 'cf-234567',
    verdict: 'WA',
    raw_verdict: null,
    language: null,
    submitted_at: '2026-07-01T10:01:00+08:00',
    runtime_ms: null,
    memory_kb: null,
    source_url: null,
    raw_json: null,
    created_at: '2026-07-01T10:01:00+08:00',
    updated_at: '2026-07-01T10:01:00+08:00',
  },
  {
    id: 'numeric-duplicate',
    problem_id: 'problem-2',
    platform: 'codeforces',
    platform_submission_id: '234567',
    verdict: 'WA',
    raw_verdict: 'WRONG_ANSWER',
    language: 'GNU C++20',
    submitted_at: '2026-07-01T10:01:00+08:00',
    runtime_ms: 62,
    memory_kb: 2048,
    source_url: 'https://codeforces.com/contest/1900/submission/234567',
    raw_json: '{"from":"api-duplicate"}',
    created_at: '2026-07-01T10:01:00+08:00',
    updated_at: '2026-07-01T10:01:00+08:00',
  },
  {
    id: 'other-platform',
    problem_id: null,
    platform: 'nowcoder',
    platform_submission_id: '123456',
    verdict: 'AC',
    raw_verdict: null,
    language: null,
    submitted_at: '2026-07-01T10:02:00+08:00',
    runtime_ms: null,
    memory_kb: null,
    source_url: null,
    raw_json: null,
    created_at: '2026-07-01T10:02:00+08:00',
    updated_at: '2026-07-01T10:02:00+08:00',
  },
]

const fakeDb = {
  prepare(sql: string) {
    if (sql.includes('SELECT id, problem_id, platform_submission_id')) {
      return {
        all: () => rows.filter(row =>
          row.platform === 'codeforces'
          && /^\d+$/.test(row.platform_submission_id),
        ),
      }
    }

    if (sql.includes('SELECT id FROM submissions')) {
      return {
        get: (platformSubmissionId: string) => rows.find(row =>
          row.platform === 'codeforces'
          && row.platform_submission_id === platformSubmissionId,
        ),
      }
    }

    if (sql.includes('SET problem_id = COALESCE')) {
      return {
        run: (
          problemId: string | null,
          rawVerdict: string | null,
          language: string | null,
          runtimeMs: number | null,
          memoryKb: number | null,
          sourceUrl: string | null,
          rawJson: string | null,
          updatedAt: string,
          targetId: string,
        ) => {
          const row = rows.find(item => item.id === targetId)
          assert.ok(row)
          row.problem_id ??= problemId
          row.raw_verdict ??= rawVerdict
          row.language ??= language
          row.runtime_ms ??= runtimeMs
          row.memory_kb ??= memoryKb
          row.source_url ??= sourceUrl
          row.raw_json ??= rawJson
          row.updated_at = updatedAt
        },
      }
    }

    if (sql.includes('DELETE FROM submissions')) {
      return {
        run: (id: string) => {
          const index = rows.findIndex(row => row.id === id)
          if (index >= 0) rows.splice(index, 1)
        },
      }
    }

    if (sql.includes('SET platform_submission_id = ?')) {
      return {
        run: (platformSubmissionId: string, updatedAt: string, id: string) => {
          const row = rows.find(item => item.id === id)
          assert.ok(row)
          row.platform_submission_id = platformSubmissionId
          row.updated_at = updatedAt
        },
      }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  },
  transaction(fn: () => void) {
    return fn
  },
}

normalizeCodeforcesSubmissionIds(fakeDb as any)

assert.strictEqual(rows.length, 3)

const normalized = rows.find(row => row.id === 'numeric-only')
assert.ok(normalized)
assert.strictEqual(normalized.platform_submission_id, 'cf-123456')

const merged = rows.find(row => row.id === 'prefixed')
assert.ok(merged)
assert.strictEqual(merged.platform_submission_id, 'cf-234567')
assert.strictEqual(merged.problem_id, 'problem-2')
assert.strictEqual(merged.raw_verdict, 'WRONG_ANSWER')
assert.strictEqual(merged.language, 'GNU C++20')
assert.strictEqual(merged.runtime_ms, 62)
assert.strictEqual(merged.memory_kb, 2048)
assert.strictEqual(merged.source_url, 'https://codeforces.com/contest/1900/submission/234567')
assert.strictEqual(merged.raw_json, '{"from":"api-duplicate"}')

assert.strictEqual(rows.some(row => row.id === 'numeric-duplicate'), false)
assert.strictEqual(
  rows.find(row => row.id === 'other-platform')?.platform_submission_id,
  '123456',
)
