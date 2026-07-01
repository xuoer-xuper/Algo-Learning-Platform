import type { ProblemIdentity, SubmissionData, Verdict } from '../shared/types'
import { toBeijing } from '../shared/time'
import { buildCodeforcesProblemUrl, type CodeforcesUrlKind } from './codeforcesUrls'
import { nowBeijing } from '../shared/time'
import { pickFinalRealtimeSubmission } from '../submissions/realtimeSubmissionFilter'
import {
  scanGenericSubmissionTable,
  selectBestSubmissionTable,
  type GenericTableData,
} from '../submissions/scrapers/GenericTableScanner'
import type { SiteAdapter, SubmissionDetectionPayload, SyncContext, TableParseContext } from './types'

interface CodeforcesSubmission {
  id: number
  contestId: number
  problem: {
    contestId: number
    index: string
    name: string
  }
  verdict?: string
  programmingLanguage?: string
  timeConsumedMillis?: number
  memoryConsumedBytes?: number
  creationTimeSeconds: number
}

const PROBLEM_PATTERNS: { pattern: RegExp; kind: CodeforcesUrlKind }[] = [
  { pattern: /^\/problemset\/problem\/(\d+)\/([A-Za-z]\d*)/, kind: 'problemset' },
  { pattern: /^\/contest\/(\d+)\/problem\/([A-Za-z]\d*)/, kind: 'contest' },
  { pattern: /^\/gym\/(\d+)\/problem\/([A-Za-z]\d*)/, kind: 'gym' },
]

function parseCodeforcesProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'codeforces.com' && parsed.hostname !== 'www.codeforces.com') return null

    for (const { pattern, kind } of PROBLEM_PATTERNS) {
      const match = parsed.pathname.match(pattern)
      if (!match) continue

      const contestId = match[1]
      const index = match[2]
      return {
        platform: 'codeforces',
        platformProblemId: `${contestId}${index}`,
        canonicalUrl: buildCodeforcesProblemUrl(contestId, index, kind),
        contestId,
        problemIndex: index,
        confidence: 'url',
      }
    }
  } catch {
    return null
  }
  return null
}

function mapCodeforcesVerdict(verdict: string | undefined): Verdict {
  switch (verdict) {
    case 'OK': return 'AC'
    case 'WRONG_ANSWER': return 'WA'
    case 'TIME_LIMIT_EXCEEDED': return 'TLE'
    case 'MEMORY_LIMIT_EXCEEDED': return 'MLE'
    case 'RUNTIME_ERROR': return 'RE'
    case 'COMPILATION_ERROR': return 'CE'
    case 'PRESENTATION_ERROR': return 'PE'
    case 'SKIPPED': return 'SKIPPED'
    case 'TESTING': return 'TESTING'
    default: return 'UNKNOWN'
  }
}

function parseApiSubmission(submission: CodeforcesSubmission): SubmissionData {
  return {
    platform: 'codeforces',
    platformSubmissionId: `cf-${submission.id}`,
    verdict: mapCodeforcesVerdict(submission.verdict),
    rawVerdict: submission.verdict,
    language: submission.programmingLanguage,
    submittedAt: toBeijing(new Date(submission.creationTimeSeconds * 1000)),
    runtimeMs: submission.timeConsumedMillis,
    memoryKb: typeof submission.memoryConsumedBytes === 'number'
      ? Math.round(submission.memoryConsumedBytes / 1024)
      : undefined,
    sourceUrl: `https://codeforces.com/contest/${submission.contestId}/submission/${submission.id}`,
    rawJson: JSON.stringify(submission),
  }
}

function parseSubmissionTables(tables: GenericTableData[], ctx: TableParseContext): SubmissionData[] {
  const table = selectBestSubmissionTable(tables)
  if (!table) return []

  return scanGenericSubmissionTable(table, {
    platform: 'codeforces',
    submissionPrefix: 'cf',
    now: ctx.now,
  })
}

function parseRealtimeTablePayload(raw: SubmissionDetectionPayload): SubmissionData | null {
  const response = raw.response && typeof raw.response === 'object'
    ? raw.response as { tables?: unknown }
    : null
  if (!Array.isArray(response?.tables)) return null

  const tables = response.tables as GenericTableData[]
  const table = selectBestSubmissionTable(tables)
  if (!table?.rows.length) return null

  const latestOnlyTable: GenericTableData = {
    ...table,
    rows: [table.rows[0]],
  }
  const latestSubmissions = parseSubmissionTables([latestOnlyTable], { now: nowBeijing })
  return pickFinalRealtimeSubmission(latestSubmissions)
}

function normalizeCell(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function getRawSubmissionRow(submission: SubmissionData): { headers: string[]; texts: string[]; links: string[] } | null {
  try {
    const raw = JSON.parse(submission.rawJson || '{}')
    const headers = Array.isArray(raw.headers) ? raw.headers.map(normalizeCell) : []
    const texts = Array.isArray(raw.row?.texts) ? raw.row.texts.map(normalizeCell) : []
    const links = Array.isArray(raw.row?.links) ? raw.row.links.map(normalizeCell) : []
    if (!texts.length && !links.length) return null
    return { headers, texts, links }
  } catch {
    return null
  }
}

function findProblemColumn(headers: string[], texts: string[], links: string[]): number {
  const headerIndex = headers.findIndex(header => /problem|问题|题目/i.test(header))
  if (headerIndex >= 0) return headerIndex

  const linkIndex = links.findIndex(link => parseCodeforcesProblem(link) !== null)
  if (linkIndex >= 0) return linkIndex

  return texts.findIndex(text => /^(\d+[A-Za-z]\d*|[A-Za-z]\d*)(?:\s*[-–—.．:]\s*|\s+)\S/.test(text))
}

function parseContestContext(url: string): { contestId: string; kind: CodeforcesUrlKind } | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'codeforces.com' && parsed.hostname !== 'www.codeforces.com') return null

    const contestMatch = parsed.pathname.match(/^\/contest\/(\d+)/)
    if (contestMatch) return { contestId: contestMatch[1], kind: 'contest' }

    const gymMatch = parsed.pathname.match(/^\/gym\/(\d+)/)
    if (gymMatch) return { contestId: gymMatch[1], kind: 'gym' }
  } catch { /* ignore */ }
  return null
}

function stripProblemTitlePrefix(problemText: string, identity: ProblemIdentity): string | undefined {
  let title = normalizeCell(problemText)
  if (!title) return undefined

  const tokens = [
    identity.platformProblemId,
    identity.contestId && identity.problemIndex ? `${identity.contestId}${identity.problemIndex}` : '',
    identity.problemIndex,
  ].filter((token): token is string => Boolean(token?.trim()))

  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = title.match(new RegExp(`^${escaped}(?:\\s*[-–—.．:]\\s*|\\s+)(\\S.*)$`, 'i'))
    if (match?.[1]) return match[1].trim()
  }

  return undefined
}

function parseProblemTextWithPageContext(problemText: string, pageUrl: string): ProblemIdentity | null {
  const context = parseContestContext(pageUrl)
  if (!context) return null

  const match = normalizeCell(problemText).match(/^([A-Za-z]\d*)(?:\s*[-–—.．:]\s*|\s+)(.+)$/)
  if (!match) return null

  const problemIndex = match[1]
  const title = match[2].trim()
  return {
    platform: 'codeforces',
    platformProblemId: `${context.contestId}${problemIndex}`,
    canonicalUrl: buildCodeforcesProblemUrl(context.contestId, problemIndex, context.kind),
    contestId: context.contestId,
    problemIndex,
    title: title || undefined,
    confidence: 'content',
  }
}

function parseProblemTextWithoutPageContext(problemText: string): ProblemIdentity | null {
  const match = normalizeCell(problemText).match(/^(\d+)([A-Za-z]\d*)(?:\s*[-–—.．:]\s*|\s+)(.+)$/)
  if (!match) return null

  const contestId = match[1]
  const problemIndex = match[2]
  const title = match[3].trim()
  return {
    platform: 'codeforces',
    platformProblemId: `${contestId}${problemIndex}`,
    canonicalUrl: buildCodeforcesProblemUrl(contestId, problemIndex, 'contest'),
    contestId,
    problemIndex,
    title: title || undefined,
    confidence: 'content',
  }
}

function resolveProblemIdentityFromSubmissionRow(submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
  const row = getRawSubmissionRow(submission)
  if (!row) return null

  const problemColumn = findProblemColumn(row.headers, row.texts, row.links)
  const problemText = problemColumn >= 0 ? row.texts[problemColumn] : ''
  const problemLink = problemColumn >= 0 ? row.links[problemColumn] : row.links.find(link => parseCodeforcesProblem(link) !== null)

  const identityFromLink = problemLink ? parseCodeforcesProblem(problemLink) : null
  if (identityFromLink) {
    const title = stripProblemTitlePrefix(problemText, identityFromLink)
    return title ? { ...identityFromLink, title } : identityFromLink
  }

  return parseProblemTextWithPageContext(problemText, raw.pageUrl)
    ?? parseProblemTextWithoutPageContext(problemText)
}

function createCodeforcesRealtimeHookScript(): string {
  return `(() => {
    const CHANNEL = '__algo_submission_v1';
    const ADAPTER_ID = 'codeforces';
    const INTENT_KEY = '__ALGO_SUBMIT_INTENT_codeforces';
    const INSTALLED_KEY = '__ALGO_CODEFORCES_REALTIME_HOOK_INSTALLED__';
    if (window[INSTALLED_KEY]) return;
    window[INSTALLED_KEY] = true;

    const now = () => Date.now();
    const pathname = () => String(location.pathname || '');
    const isSingleSubmissionPage = () => /^\\/(?:contest|gym)\\/\\d+\\/submission\\/\\d+\\/?$/.test(pathname());
    const isMySubmissionPage = () => /^\\/(?:contest|gym)\\/\\d+\\/my\\/?$/.test(pathname())
      || /^\\/submissions\\/[^/]+\\/?$/.test(pathname())
      || /^\\/problemset\\/status\\/?$/.test(pathname());
    const readIntent = () => {
      try {
        return JSON.parse(sessionStorage.getItem(INTENT_KEY) || 'null') || {};
      } catch (_) {
        return {};
      }
    };
    const writeIntent = (intent) => {
      try {
        sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
      } catch (_) {}
    };
    const markSubmitIntent = (source) => {
      const problemMatch = pathname().match(/^\\/(?:contest|gym)\\/(\\d+)\\/problem\\/([A-Za-z]\\d*)/)
        || pathname().match(/^\\/problemset\\/problem\\/(\\d+)\\/([A-Za-z]\\d*)/);
      writeIntent({
        at: now(),
        source,
        pageUrl: location.href,
        contestId: problemMatch?.[1] || '',
        problemIndex: problemMatch?.[2] || ''
      });
    };
    const hasRecentSubmitIntent = () => {
      const intent = readIntent();
      return typeof intent.at === 'number' && now() - intent.at < 5 * 60 * 1000;
    };
    const maybeSubmitUrl = (requestUrl, method) => {
      const url = String(requestUrl || '').toLowerCase();
      const verb = String(method || '').toUpperCase();
      if (verb && verb !== 'POST' && verb !== 'PUT') return false;
      return /\\/submit(?:\\?|\\/|$)|\\/problemset\\/submit|\\/contest\\/\\d+\\/submit|\\/gym\\/\\d+\\/submit/.test(url);
    };

    const textOf = (element) => {
      const clone = element.cloneNode(true);
      clone.querySelectorAll('script,style,noscript').forEach((node) => node.remove());
      return (clone.textContent || '').trim();
    };

    const extractTables = () => {
      const tables = Array.from(document.querySelectorAll('table')).map((table) => {
        let headers = Array.from(table.querySelectorAll('thead th, thead td')).map(textOf);
        if (!headers.length) {
          const firstRow = table.querySelector('tr');
          if (firstRow) headers = Array.from(firstRow.querySelectorAll('th')).map(textOf);
        }

        const bodyRows = table.querySelectorAll('tbody tr').length
          ? Array.from(table.querySelectorAll('tbody tr'))
          : Array.from(table.querySelectorAll('tr')).filter((row) => !row.querySelector('th'));

        const rows = bodyRows.map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          return {
            texts: cells.map(textOf),
            links: cells.map((cell) => {
              const anchor = cell.querySelector('a');
              return anchor ? anchor.href : '';
            }),
            rowId: row.id || row.getAttribute('data-id') || row.getAttribute('data-submission-id') || ''
          };
        }).filter((row) => row.texts.length >= 2);

        return { headers, rows };
      });
      return tables.filter((table) => table.rows.length > 0);
    };

    const shouldReport = () => isSingleSubmissionPage() || (isMySubmissionPage() && hasRecentSubmitIntent());

    const report = () => {
      try {
        if (!shouldReport()) return;
        const tables = extractTables();
        if (!tables.length) return;
        const payload = {
          adapterId: ADAPTER_ID,
          pageUrl: location.href,
          requestUrl: location.href,
          response: { _source: 'codeforces-realtime-scan', tables },
          meta: {
            pageTitle: typeof document !== 'undefined' ? document.title : '',
            submitIntent: hasRecentSubmitIntent()
          },
          detectedAt: new Date().toISOString()
        };
        if (window[CHANNEL] && typeof window[CHANNEL].reportSubmission === 'function') {
          window[CHANNEL].reportSubmission(payload);
        } else {
          window.postMessage({ channel: CHANNEL, payload }, '*');
        }
      } catch (_) {}
    };

    try {
      document.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target.closest('button,input,a') : null;
        const text = String(target?.textContent || target?.value || '').trim();
        if (/submit|提交/i.test(text)) markSubmitIntent('click');
      }, true);
      document.addEventListener('submit', () => markSubmitIntent('form'), true);
    } catch (_) {}

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' ? input : input && input.url;
        const method = init?.method || (typeof input === 'object' && input ? input.method : '');
        if (maybeSubmitUrl(requestUrl, method)) markSubmitIntent('fetch');
        return originalFetch.apply(this, arguments);
      };
    }

    const OriginalXHR = window.XMLHttpRequest;
    if (OriginalXHR && OriginalXHR.prototype) {
      const originalOpen = OriginalXHR.prototype.open;
      const originalSend = OriginalXHR.prototype.send;
      OriginalXHR.prototype.open = function(method, url) {
        this.__algoRequestUrl = url;
        this.__algoRequestMethod = method;
        return originalOpen.apply(this, arguments);
      };
      OriginalXHR.prototype.send = function() {
        if (maybeSubmitUrl(this.__algoRequestUrl, this.__algoRequestMethod)) markSubmitIntent('xhr');
        return originalSend.apply(this, arguments);
      };
    }

    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(report, 500);
    };

    [0, 800, 2000, 5000, 9000].forEach((delay) => setTimeout(report, delay));
    try {
      if (typeof MutationObserver !== 'undefined' && document.body) {
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    } catch (_) {}
  })();`
}

export const codeforcesAdapter: SiteAdapter = {
  id: 'codeforces',
  name: 'Codeforces',
  domains: ['codeforces.com', 'www.codeforces.com'],
  homeUrl: 'https://codeforces.com',
  injectOnProblemPage: true,

  matchProblem(url: string): boolean {
    return parseCodeforcesProblem(url) !== null
  },

  parseProblem(url: string): ProblemIdentity | null {
    return parseCodeforcesProblem(url)
  },

  matchSubmissionResult(url: string): boolean {
    try {
      const parsed = new URL(url)
      if (parsed.hostname !== 'codeforces.com' && parsed.hostname !== 'www.codeforces.com') return false
      return /^\/(?:contest|gym)\/\d+\/submission\/\d+\/?$/.test(parsed.pathname)
        || /^\/(?:contest|gym)\/\d+\/my\/?$/.test(parsed.pathname)
        || /^\/submissions\/[^/]+\/?$/.test(parsed.pathname)
        || /^\/problemset\/status\/?$/.test(parsed.pathname)
    } catch {
      return false
    }
  },

  parseSubmissionTables,

  injectHookScript(): string {
    return createCodeforcesRealtimeHookScript()
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    return parseRealtimeTablePayload(raw)
  },

  resolveProblemIdentity(submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
    return resolveProblemIdentityFromSubmissionRow(submission, raw)
  },

  async syncSubmissions(ctx: SyncContext): Promise<SubmissionData[]> {
    const handle = ctx.handle?.trim()
    if (!handle) throw new Error('Codeforces handle is required')

    const url = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=100`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Codeforces API error: ${response.status}`)

    const json = await response.json() as { status: string; result?: CodeforcesSubmission[] }
    if (json.status !== 'OK' || !Array.isArray(json.result)) {
      throw new Error('Codeforces API returned non-OK status')
    }

    return json.result.map(parseApiSubmission)
  },
}
