import type { ProblemIdentity, SubmissionData } from '../shared/types'
import { nowBeijing } from '../shared/time'
import { pickFinalRealtimeSubmission } from '../submissions/realtimeSubmissionFilter'
import { normalizeVerdict } from './verdictMap'
import {
  scanGenericSubmissionTable,
  selectBestSubmissionTable,
  type GenericTableData,
} from '../submissions/scrapers/GenericTableScanner'
import { resolveProblemIdentityFromBrowserTitle } from './browserTitleIdentity'
import type { SiteAdapter, SubmissionDetectionPayload, TableParseContext } from './types'

function stripHtml(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    : String(value ?? '').trim()
}

function parseRuntimeMs(raw: string): number | undefined {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(ms|s)?/i)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  return match[2]?.toLowerCase() === 's' ? Math.round(value * 1000) : Math.round(value)
}

function parseMemoryKb(raw: string): number | undefined {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(kb|mb|kib|mib)\b/i)
    ?? raw.trim().match(/^(\d+(?:\.\d+)?)$/i)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  return match[2]?.toLowerCase().startsWith('m') ? Math.round(value * 1024) : Math.round(value)
}

function findColumnIndex(headers: string[], keywords: string[]): number {
  return headers.findIndex(header => keywords.some(keyword => header.toLowerCase().includes(keyword.toLowerCase())))
}

function parseAcwingProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'www.acwing.com' && parsed.hostname !== 'acwing.com') return null

    const match = parsed.pathname.match(/^\/problem\/content\/(?:description\/|submission\/)?(\d+)\/?/)
    if (!match) return null

    const id = match[1]
    return {
      platform: 'acwing',
      platformProblemId: id,
      canonicalUrl: `https://www.acwing.com/problem/content/${id}/`,
      confidence: 'url',
    }
  } catch {
    return null
  }
}

function parseNowcoderProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname

    if (parsed.hostname === 'www.nowcoder.com' || parsed.hostname === 'nowcoder.com') {
      const match = path.match(/^\/(?:practice|questionTerminal)\/([a-f0-9-]+)/)
      if (!match) return null

      return {
        platform: 'nowcoder',
        platformProblemId: match[1],
        canonicalUrl: parsed.origin + parsed.pathname,
        confidence: 'url',
      }
    }

    if (parsed.hostname !== 'ac.nowcoder.com') return null

    const problemMatch = path.match(/^\/acm\/problem\/(\d+)/)
    if (problemMatch) {
      return {
        platform: 'nowcoder',
        platformProblemId: problemMatch[1],
        canonicalUrl: parsed.origin + parsed.pathname,
        confidence: 'url',
      }
    }

    const contestMatch = path.match(/^\/acm\/contest\/(\d+)\/([A-Za-z]\d*)\/?$/)
    if (!contestMatch) return null

    const contestId = contestMatch[1]
    const index = contestMatch[2]
    return {
      platform: 'nowcoder',
      platformProblemId: `contest-${contestId}-${index}`,
      canonicalUrl: parsed.origin + parsed.pathname,
      contestId,
      problemIndex: index,
      confidence: 'url',
    }
  } catch {
    return null
  }
}

function parseVjudgeProblem(url: string): ProblemIdentity | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'vjudge.net' && parsed.hostname !== 'www.vjudge.net') return null

    const problemMatch = parsed.pathname.match(/^\/problem\/([^/\s]+)-(.+)/)
    if (problemMatch) {
      const sourceOJ = problemMatch[1]
      const problemId = problemMatch[2]
      return {
        platform: 'vjudge',
        platformProblemId: `${sourceOJ}-${problemId}`,
        canonicalUrl: `https://vjudge.net/problem/${sourceOJ}-${problemId}`,
        sourcePlatform: sourceOJ,
        sourceProblemId: problemId,
        confidence: 'url',
      }
    }

    const contestMatch = parsed.pathname.match(/^\/contest\/(\d+)/)
    const problemLetter = parsed.hash.match(/#problem\/([A-Za-z0-9]+)/)?.[1]
    if (contestMatch && problemLetter) {
      const contestId = contestMatch[1]
      return {
        platform: 'vjudge',
        platformProblemId: `contest-${contestId}-${problemLetter}`,
        canonicalUrl: `https://vjudge.net/contest/${contestId}#problem/${problemLetter}`,
        contestId,
        problemIndex: problemLetter,
        confidence: 'url',
      }
    }
  } catch {
    return null
  }
  return null
}

function scanBestTable(
  tables: GenericTableData[],
  platform: string,
  submissionPrefix: string,
  ctx: TableParseContext,
): SubmissionData[] {
  const table = selectBestSubmissionTable(tables)
  if (!table) return []

  return scanGenericSubmissionTable(table, {
    platform,
    submissionPrefix,
    now: ctx.now,
  })
}

function parseRealtimeTablePayload(
  raw: SubmissionDetectionPayload,
  parseTables: (tables: GenericTableData[], ctx: TableParseContext) => SubmissionData[],
): SubmissionData | null {
  const response = raw.response && typeof raw.response === 'object'
    ? raw.response as { tables?: unknown }
    : null
  if (!Array.isArray(response?.tables)) return null

  const table = selectBestSubmissionTable(response.tables as GenericTableData[])
  if (!table?.rows.length) return null

  const latestOnlyTable: GenericTableData = {
    ...table,
    rows: [table.rows[0]],
  }
  const submissions = parseTables([latestOnlyTable], { now: nowBeijing })
  return pickFinalRealtimeSubmission(submissions)
}

function hasStandaloneLatinToken(value: string, token: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9\\u4e00-\\u9fff])${token}($|[^A-Za-z0-9\\u4e00-\\u9fff])`, 'i').test(value)
}

function hasResultContext(value: string): boolean {
  return /结果|状态|评测|运行|提交|verdict|result|status|judge|submission/i.test(value)
}

function isNowcoderSelfTestResult(value: string): boolean {
  return /自测|调试|样例测试|测试用例|testcase|custom\s*test|sample\s*test/i.test(value)
    && !/提交记录|正式提交|submission/i.test(value)
}

function extractNowcoderSubmissionId(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url.trim()) return undefined
  try {
    const parsed = new URL(url)
    const id = parsed.searchParams.get('submissionId')
      ?? parsed.searchParams.get('submission_id')
      ?? parsed.searchParams.get('id')
    if (id && /^\d+$/.test(id)) return id
  } catch { /* ignore */ }

  const match = url.match(/[?&](?:submissionId|submission_id|id)=(\d+)\b/)
  return match?.[1]
}

function extractVjudgeSubmissionIdFromLinks(links: unknown): string | undefined {
  if (!Array.isArray(links)) return undefined
  for (const link of links) {
    if (typeof link !== 'string') continue
    const match = link.match(/\/(?:solution|problem\/view\/submission)\/(\d+)\b/)
    if (match) return match[1]
  }
  return undefined
}

function parseVjudgeProblemText(value: unknown): {
  problemId: string
  sourcePlatform: string
  sourceProblemId: string
} | null {
  const text = stripHtml(value).replace(/\s+/g, ' ').trim()
  if (!text) return null

  const match = text.match(/^([A-Za-z][A-Za-z0-9_+.-]*)[-\s]+(.+)$/)
  if (!match) return null

  const sourcePlatform = match[1].trim()
  const sourceProblemId = match[2].replace(/\s+/g, '').trim()
  if (!sourcePlatform || !sourceProblemId) return null

  return {
    problemId: `${sourcePlatform}-${sourceProblemId}`,
    sourcePlatform,
    sourceProblemId,
  }
}

function attachVjudgeRawProblemContext(submission: SubmissionData): SubmissionData {
  try {
    const raw = JSON.parse(submission.rawJson || '{}')
    const headers = Array.isArray(raw.headers) ? raw.headers : []
    const texts = Array.isArray(raw.row?.texts) ? raw.row.texts : []
    const problemIdx = findColumnIndex(headers, ['Problem', '题目', '问题'])
    const problem = parseVjudgeProblemText(problemIdx >= 0 ? texts[problemIdx] : raw._vjudgeProblem)
    if (!problem) return submission

    return {
      ...submission,
      rawJson: JSON.stringify({
        ...raw,
        _vjudgeProblem: problemIdx >= 0 ? texts[problemIdx] : raw._vjudgeProblem,
        _vjudgeProblemId: problem.problemId,
        _vjudgeSourcePlatform: problem.sourcePlatform,
        _vjudgeSourceProblemId: problem.sourceProblemId,
      }),
      _vjudgeProblemId: problem.problemId,
    } as any
  } catch {
    return submission
  }
}

function mapFrontendVerdict(raw: string, options: { allowAlias?: boolean } = {}): SubmissionData['verdict'] {
  const value = raw.trim().toLowerCase()
  if (!value) return 'UNKNOWN'
  if (value.includes('答案正确') || value.includes('accepted') || /(^|\s)通过(\s|$)/.test(value)) return 'AC'
  if (value.includes('部分正确')) return 'WA'
  if (value.includes('答案错误') || value.includes('wrong answer')) return 'WA'
  if (value.includes('时间超限') || value.includes('超出时间限制') || value.includes('运行超时') || value.includes('time limit')) return 'TLE'
  if (value.includes('内存超限') || value.includes('超出内存限制') || value.includes('memory limit')) return 'MLE'
  if (value.includes('运行错误') || value.includes('运行时错误') || value.includes('runtime error')) return 'RE'
  if (value.includes('编译错误') || value.includes('compile error') || value.includes('compilation error')) return 'CE'
  if (value.includes('格式错误') || value.includes('presentation error')) return 'PE'
  if (value.includes('输出超限') || value.includes('output limit')) return 'OLE'
  if (value.includes('等待评测') || value.includes('正在评测') || value.includes('评测中') || value.includes('pending') || value.includes('judging') || value.includes('running')) return 'TESTING'
  if (options.allowAlias) {
    if (hasStandaloneLatinToken(raw, 'AC')) return 'AC'
    if (hasStandaloneLatinToken(raw, 'WA')) return 'WA'
    if (hasStandaloneLatinToken(raw, 'TLE')) return 'TLE'
    if (hasStandaloneLatinToken(raw, 'MLE')) return 'MLE'
    if (hasStandaloneLatinToken(raw, 'RE')) return 'RE'
    if (hasStandaloneLatinToken(raw, 'CE')) return 'CE'
    if (hasStandaloneLatinToken(raw, 'PE')) return 'PE'
    if (hasStandaloneLatinToken(raw, 'OLE')) return 'OLE'
  }
  return 'UNKNOWN'
}

function parseFrontendVerdictPayload(
  raw: SubmissionDetectionPayload,
  platform: string,
  submissionPrefix: string,
): SubmissionData | null {
  const response = raw.response && typeof raw.response === 'object'
    ? raw.response as { _source?: unknown; submitId?: unknown; text?: unknown; verdictText?: unknown; links?: unknown }
    : null
  if (response?._source !== 'frontend-verdict-observer') return null
  if (typeof response.submitId !== 'string' || !response.submitId.trim()) return null

  const text = typeof response.text === 'string' ? response.text : ''
  if (platform === 'nowcoder' && isNowcoderSelfTestResult(text)) return null

  const rawVerdict = typeof response.verdictText === 'string' && response.verdictText.trim()
    ? response.verdictText.trim()
    : text
  const verdictFromText = mapFrontendVerdict(text, { allowAlias: hasResultContext(text) })
  const verdict = verdictFromText !== 'UNKNOWN' && verdictFromText !== 'TESTING'
    ? verdictFromText
    : text.trim() === rawVerdict.trim()
      ? mapFrontendVerdict(rawVerdict, { allowAlias: true })
      : 'UNKNOWN'
  if (verdict === 'UNKNOWN' || verdict === 'TESTING') return null
  const sourceUrl = typeof raw.requestUrl === 'string' && raw.requestUrl.trim()
    ? raw.requestUrl
    : raw.pageUrl
  const officialNowcoderSubmissionId = platform === 'nowcoder'
    ? extractNowcoderSubmissionId(sourceUrl)
    : undefined
  const officialVjudgeSubmissionId = platform === 'vjudge'
    ? extractVjudgeSubmissionIdFromLinks(response.links) ?? extractVjudgeSubmissionIdFromLinks([sourceUrl])
    : undefined
  const officialSubmissionId = officialNowcoderSubmissionId ?? officialVjudgeSubmissionId

  return {
    platform,
    platformSubmissionId: officialSubmissionId
      ? `${submissionPrefix}-${officialSubmissionId}`
      : `${submissionPrefix}-rt-${response.submitId}`,
    verdict,
    rawVerdict,
    runtimeMs: parseRuntimeMs(text),
    memoryKb: parseMemoryKb(text),
    submittedAt: nowBeijing(),
    sourceUrl,
    rawJson: JSON.stringify({
      _source: 'frontend-verdict-observer',
      text: text.slice(0, 1000),
      links: Array.isArray(response.links) ? response.links.slice(0, 10) : undefined,
    }),
  }
}

function createFrontendVerdictHookScript(adapterId: string): string {
  return `(() => {
    const CHANNEL = '__algo_submission_v1';
    const ADAPTER_ID = ${JSON.stringify(adapterId)};
    const INTENT_KEY = '__ALGO_SUBMIT_INTENT_' + ADAPTER_ID;
    const INSTALLED_KEY = '__ALGO_FRONTEND_VERDICT_HOOKS__';
    const FINAL_STABLE_DELAY = 900;
    window[INSTALLED_KEY] = window[INSTALLED_KEY] || {};
    const state = window[INSTALLED_KEY][ADAPTER_ID] || {
      observerInstalled: false,
      lastResultKey: '',
      pendingResultKey: '',
      pendingTimer: 0
    };
    window[INSTALLED_KEY][ADAPTER_ID] = state;

    const now = () => Date.now();
    const readIntent = () => {
      try {
        return JSON.parse(sessionStorage.getItem(INTENT_KEY) || 'null') || {};
      } catch (_) {
        return {};
      }
    };
    const getTopPageUrl = () => {
      try {
        const value = window.__ALGO_TOP_PAGE_URL;
        if (typeof value === 'string' && value.trim()) return value;
      } catch (_) {}
      return location.href;
    };
    const parseUrl = (value) => {
      try {
        return new URL(String(value || ''), location.href);
      } catch (_) {
        return null;
      }
    };
    const isProblemPage = (urlValue = getTopPageUrl()) => {
      const parsed = parseUrl(urlValue);
      if (!parsed) return false;
      const host = String(parsed.hostname || '');
      const path = String(parsed.pathname || '');
      if (ADAPTER_ID === 'acwing') {
        return /^(?:www\\.)?acwing\\.com$/.test(host)
          && /^\\/problem\\/content\\/(?:description\\/)?\\d+\\/?$/.test(path);
      }
      if (ADAPTER_ID === 'nowcoder') {
        if (/^(?:www\\.)?nowcoder\\.com$/.test(host)) {
          return /^\\/(?:practice|questionTerminal)\\/[a-f0-9-]+\\/?$/i.test(path);
        }
        return host === 'ac.nowcoder.com'
          && (/^\\/acm\\/problem\\/\\d+\\/?$/.test(path)
            || /^\\/acm\\/contest\\/\\d+\\/[A-Za-z]\\d*\\/?$/.test(path));
      }
      return true;
    };
    const writeIntent = (intent) => {
      try {
        sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
      } catch (_) {}
    };
    const clearIntent = () => {
      try {
        sessionStorage.removeItem(INTENT_KEY);
      } catch (_) {}
      state.lastResultKey = '';
      state.pendingResultKey = '';
      clearTimeout(state.pendingTimer);
    };
    const markSubmitIntent = (source) => {
      if (!isProblemPage()) return;
      const current = readIntent();
      const id = current.id && now() - current.at < 1000 ? current.id : String(now().toString(36) + Math.random().toString(36).slice(2, 8));
      state.lastResultKey = '';
      writeIntent({
        id,
        at: now(),
        source,
        pageUrl: getTopPageUrl()
      });
    };
    const hasRecentSubmitIntent = () => {
      const intent = readIntent();
      const fresh = typeof intent.at === 'number'
        && now() - intent.at < 5 * 60 * 1000
        && typeof intent.id === 'string'
        && intent.id;
      if (!fresh) return false;
      return isProblemPage();
    };
    const maybeSubmitUrl = (requestUrl, method) => {
      const url = String(requestUrl || '').toLowerCase();
      const verb = String(method || 'GET').toUpperCase();
      if (verb !== 'POST' && verb !== 'PUT' && verb !== 'PATCH') return false;
      if (/view|history|record-list|submission-list|view-submission|submissionid|detail|status/.test(url)) return false;
      if (ADAPTER_ID === 'nowcoder') {
        const isNowcoderSelfTestUrl = /(?:^|[/?&#=_-])(?:self|custom|sample|test|testcase|debug|trial|run|compile|execute)(?:$|[/?&#=_-])|自测|调试|运行|样例|测试/.test(url);
        const isNowcoderOfficialSubmitUrl = /submit|submission|commit|judge/.test(url)
          && !isNowcoderSelfTestUrl;
        if (isNowcoderOfficialSubmitUrl) return true;
        if (isNowcoderSelfTestUrl) {
          clearIntent();
          return false;
        }
        return false;
      }
      return /submit|submission|judge|coding|answer|commit/.test(url);
    };
    const isNowcoderSelfTestText = (text) => ADAPTER_ID === 'nowcoder'
      && /自测|调试|运行|run|test|样例|测试/i.test(text)
      && !/提交|submit/i.test(text);
    const isOfficialSubmitText = (text) => {
      const value = String(text || '').replace(/\\s+/g, ' ').trim();
      if (!/提交|submit/i.test(value)) return false;
      if (/查看|上次|记录|详情|历史|列表|状态|结果|我的提交|提交记录|View|Last|History|Record|Detail|Status|Result|Submission\\s+List/i.test(value)) {
        return false;
      }
      return /^(提交|提交答案|提交代码|提交评测|提交并评测|Submit|Submit\\s+Answer|Submit\\s+Code|Submit\\s+Solution)$/i.test(value);
    };
    const textOf = (node) => {
      try {
        if (!node) return '';
        const element = node.nodeType === 1 ? node : node.parentElement;
        if (!element) return '';
        const clone = element.cloneNode(true);
        clone.querySelectorAll('script,style,noscript,textarea,pre,code').forEach((child) => child.remove());
        return (clone.textContent || '').replace(/\\s+/g, ' ').trim();
      } catch (_) {
        return '';
      }
    };
    const strictVerdictPatterns = [
      { verdict: '答案正确', pattern: /答案正确|Accepted|(^|\\s)通过(\\s|$)/i },
      { verdict: '答案错误', pattern: /答案错误|Wrong\\s+Answer/i },
      { verdict: '时间超限', pattern: /时间超限|运行超时|Time\\s+Limit/i },
      { verdict: '内存超限', pattern: /内存超限|Memory\\s+Limit/i },
      { verdict: '运行错误', pattern: /运行错误|运行时错误|Runtime\\s+Error/i },
      { verdict: '编译错误', pattern: /编译错误|Compile\\s+Error|Compilation\\s+Error/i },
      { verdict: '格式错误', pattern: /格式错误|Presentation\\s+Error/i },
      { verdict: '输出超限', pattern: /输出超限|Output\\s+Limit/i }
    ];
    const aliasVerdictPatterns = [
      { verdict: '答案正确', pattern: /(^|[^A-Za-z0-9\\u4e00-\\u9fff])AC($|[^A-Za-z0-9\\u4e00-\\u9fff])/i },
      { verdict: '答案错误', pattern: /(^|[^A-Za-z0-9\\u4e00-\\u9fff])WA($|[^A-Za-z0-9\\u4e00-\\u9fff])/i },
      { verdict: '时间超限', pattern: /(^|[^A-Za-z0-9\\u4e00-\\u9fff])TLE($|[^A-Za-z0-9\\u4e00-\\u9fff])/i },
      { verdict: '内存超限', pattern: /(^|[^A-Za-z0-9\\u4e00-\\u9fff])MLE($|[^A-Za-z0-9\\u4e00-\\u9fff])/i },
      { verdict: '运行错误', pattern: /(^|[^A-Za-z0-9\\u4e00-\\u9fff])RE($|[^A-Za-z0-9\\u4e00-\\u9fff])/i },
      { verdict: '编译错误', pattern: /(^|[^A-Za-z0-9\\u4e00-\\u9fff])CE($|[^A-Za-z0-9\\u4e00-\\u9fff])/i },
      { verdict: '格式错误', pattern: /(^|[^A-Za-z0-9\\u4e00-\\u9fff])PE($|[^A-Za-z0-9\\u4e00-\\u9fff])/i },
      { verdict: '输出超限', pattern: /(^|[^A-Za-z0-9\\u4e00-\\u9fff])OLE($|[^A-Za-z0-9\\u4e00-\\u9fff])/i }
    ];
    const pendingPattern = /等待评测|正在评测|评测中|排队中|Pending|Judging|Running|Testing/i;
    const resultContextPattern = /结果|状态|评测|运行|提交|verdict|result|status|judge|submission/i;
    const pickVerdict = (text, isLikelyElement) => {
      if (!text || pendingPattern.test(text)) return '';
      for (const item of strictVerdictPatterns) {
        if (item.pattern.test(text)) return item.verdict;
      }
      if (isLikelyElement || resultContextPattern.test(text)) {
        for (const item of aliasVerdictPatterns) {
          if (item.pattern.test(text)) return item.verdict;
        }
      }
      return '';
    };
    const isLikelyResultElement = (element) => {
      if (!element || element.nodeType !== 1) return false;
      const marker = String((element.id || '') + ' ' + (element.className || '') + ' ' + (element.getAttribute('role') || '')).toLowerCase();
      return /result|status|judge|submit|submission|answer|toast|message|modal|dialog|alert|notice|popup|运行|结果|状态|评测|提交/.test(marker);
    };
    const candidatesFrom = (node) => {
      const element = node && node.nodeType === 1 ? node : node?.parentElement;
      const candidates = [];
      let current = element;
      for (let depth = 0; current && depth < 5; depth++) {
        candidates.push(current);
        current = current.parentElement;
      }
      try {
        document.querySelectorAll('[role="dialog"],[class*="result"],[class*="status"],[class*="judge"],[class*="submit"],[class*="answer"],[class*="message"],[class*="modal"],[class*="dialog"],[class*="toast"],[class*="alert"],[id*="result"],[id*="status"],[id*="judge"],[id*="submit"],[id*="answer"],[id*="modal"],[id*="dialog"]').forEach((item) => candidates.push(item));
      } catch (_) {}
      return Array.from(new Set(candidates)).filter(Boolean);
    };
    const linksOf = (element) => {
      try {
        return Array.from(element?.querySelectorAll?.('a') || [])
          .map((anchor) => anchor.href || anchor.getAttribute('href') || '')
          .filter(Boolean)
          .slice(0, 10);
      } catch (_) {
        return [];
      }
    };
    const report = (candidate, text, verdictText) => {
      try {
        const intent = readIntent();
        if (!hasRecentSubmitIntent()) return;
        const key = intent.id + ':' + verdictText + ':' + text.slice(0, 200);
        if (state.lastResultKey === key) return;
        state.lastResultKey = key;
        const effectivePageUrl = ADAPTER_ID === 'nowcoder'
          && typeof intent.pageUrl === 'string'
          && isProblemPage(intent.pageUrl)
          ? intent.pageUrl
          : getTopPageUrl();
        const payload = {
          adapterId: ADAPTER_ID,
          pageUrl: effectivePageUrl,
          requestUrl: location.href,
          response: {
            _source: 'frontend-verdict-observer',
            submitId: intent.id,
            verdictText,
            text,
            links: linksOf(candidate)
          },
          meta: {
            pageTitle: typeof document !== 'undefined' ? document.title : '',
            submitIntent: true
          },
          detectedAt: new Date().toISOString()
        };
        if (window[CHANNEL] && typeof window[CHANNEL].reportSubmission === 'function') {
          window[CHANNEL].reportSubmission(payload);
        } else {
          const targetWindow = window.top && window.top !== window ? window.top : window;
          targetWindow.postMessage({ channel: CHANNEL, payload }, '*');
        }
      } catch (_) {}
    };
    const scheduleReport = (candidate, text, verdictText, isLikelyElement) => {
      try {
        const intent = readIntent();
        if (!hasRecentSubmitIntent()) return;
        const key = intent.id + ':' + verdictText + ':' + text.slice(0, 200);
        if (state.pendingResultKey === key) return;
        state.pendingResultKey = key;
        clearTimeout(state.pendingTimer);
        state.pendingTimer = setTimeout(() => {
          try {
            if (!hasRecentSubmitIntent()) return;
            const latestText = textOf(candidate);
            const latestVerdictText = pickVerdict(latestText, isLikelyElement);
            if (latestVerdictText !== verdictText) return;
            report(candidate, latestText, latestVerdictText);
          } catch (_) {}
        }, FINAL_STABLE_DELAY);
      } catch (_) {}
    };
    const scanNode = (node) => {
      if (!hasRecentSubmitIntent()) return;
      for (const candidate of candidatesFrom(node)) {
        const text = textOf(candidate);
        if (!text || text.length > 5000) continue;
        const isLikely = isLikelyResultElement(candidate);
        const verdictText = pickVerdict(text, isLikely);
        if (!verdictText) continue;
        if (!isLikely && text.length > 800) continue;
        scheduleReport(candidate, text, verdictText, isLikely);
        return;
      }
    };
    const scanDocument = () => {
      if (!document.body) return;
      scanNode(document.body);
    };

    try {
      document.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target.closest('button,input,a,[role="button"]') : null;
        const text = String(target?.textContent || target?.value || target?.getAttribute?.('aria-label') || '').trim();
        if (isNowcoderSelfTestText(text)) {
          clearIntent();
          return;
        }
        if (isOfficialSubmitText(text)) {
          markSubmitIntent('click');
          [300, 800, 1500, 3000, 6000, 10000].forEach((delay) => setTimeout(scanDocument, delay));
        }
      }, true);
      document.addEventListener('submit', () => {
        markSubmitIntent('form');
        [300, 800, 1500, 3000, 6000, 10000].forEach((delay) => setTimeout(scanDocument, delay));
      }, true);
    } catch (_) {}

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' ? input : input && input.url;
        const method = init?.method || (typeof input === 'object' && input ? input.method : '');
        if (maybeSubmitUrl(requestUrl, method)) {
          markSubmitIntent('fetch');
          [300, 800, 1500, 3000, 6000, 10000].forEach((delay) => setTimeout(scanDocument, delay));
        }
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
        if (maybeSubmitUrl(this.__algoRequestUrl, this.__algoRequestMethod)) {
          markSubmitIntent('xhr');
          [300, 800, 1500, 3000, 6000, 10000].forEach((delay) => setTimeout(scanDocument, delay));
        }
        return originalSend.apply(this, arguments);
      };
    }

    const installObserver = () => {
      try {
        if (state.observerInstalled || typeof MutationObserver === 'undefined' || !document.body) return false;
        state.observerInstalled = true;
        const observer = new MutationObserver((mutations) => {
          if (!hasRecentSubmitIntent()) return;
          for (const mutation of mutations) {
            scanNode(mutation.target);
            mutation.addedNodes && mutation.addedNodes.forEach(scanNode);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        return true;
      } catch (_) {
        return false;
      }
    };
    [0, 300, 1000, 2500, 5000].forEach((delay) => setTimeout(installObserver, delay));

    try {
      if (hasRecentSubmitIntent()) {
        [0, 300, 800, 1500, 3000, 6000, 10000].forEach((delay) => setTimeout(scanDocument, delay));
      }
    } catch (_) {}
  })();`
}

function createVjudgeStatusHookScript(): string {
  return `(() => {
    const CHANNEL = '__algo_submission_v1';
    const ADAPTER_ID = 'vjudge';
    const INTENT_KEY = '__ALGO_SUBMIT_INTENT_vjudge';
    if (window.__ALGO_VJUDGE_STATUS_HOOK_INSTALLED__) return;
    window.__ALGO_VJUDGE_STATUS_HOOK_INSTALLED__ = true;

    const now = () => Date.now();
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
      const intent = readIntent();
      writeIntent({
        ...intent,
        at: now(),
        source,
        pageUrl: location.href
      });
    };
    const hasRecentSubmitIntent = () => {
      const intent = readIntent();
      return typeof intent.at === 'number' && now() - intent.at < 3 * 60 * 1000;
    };
    const maybeSubmitUrl = (requestUrl, method) => {
      const url = String(requestUrl || '').toLowerCase();
      const verb = String(method || 'GET').toUpperCase();
      if (verb !== 'POST' && verb !== 'PUT') return false;
      return /\\/submit\\b|\\/problem\\/submit|\\/contest\\/submit|\\/solution\\/submit/.test(url);
    };

    const report = (requestUrl, response) => {
      try {
        const payload = {
          adapterId: ADAPTER_ID,
          pageUrl: location.href,
          requestUrl: String(requestUrl),
          response,
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

    const shouldReport = (requestUrl, json) => /\\/status\\/data\\/?/.test(String(requestUrl || ''))
      && Array.isArray(json?.data)
      && hasRecentSubmitIntent();

    try {
      const isOfficialSubmitText = (text) => {
        const value = String(text || '').replace(/\\s+/g, ' ').trim();
        if (!/提交|submit/i.test(value)) return false;
        if (/查看|上次|记录|详情|历史|列表|状态|结果|我的提交|提交记录|View|Last|History|Record|Detail|Status|Result|Submission\\s+List/i.test(value)) {
          return false;
        }
        return /^(提交|提交答案|提交代码|提交评测|提交并评测|Submit|Submit\\s+Answer|Submit\\s+Code|Submit\\s+Solution)$/i.test(value);
      };
      document.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target.closest('button,input,a') : null;
        const text = String(target?.textContent || target?.value || '').trim();
        if (isOfficialSubmitText(text)) markSubmitIntent('click');
      }, true);
      document.addEventListener('submit', () => markSubmitIntent('form'), true);
    } catch (_) {}

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' ? input : input && input.url;
        const method = init?.method || (typeof input === 'object' && input ? input.method : '');
        if (maybeSubmitUrl(requestUrl, method)) markSubmitIntent('fetch');
        const response = await originalFetch.apply(this, arguments);
        try {
          if (requestUrl) {
            response.clone().json().then((json) => {
              if (shouldReport(requestUrl, json)) report(requestUrl, json);
            }).catch(() => {});
          }
        } catch (_) {}
        return response;
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
        this.addEventListener('load', function() {
          try {
            const requestUrl = this.__algoRequestUrl;
            if (!requestUrl) return;
            const json = JSON.parse(this.responseText);
            if (shouldReport(requestUrl, json)) report(requestUrl, json);
          } catch (_) {}
        });
        return originalSend.apply(this, arguments);
      };
    }
  })();`
}

function parseVjudgeStatusData(raw: SubmissionDetectionPayload): SubmissionData | null {
  const response = raw.response && typeof raw.response === 'object'
    ? raw.response as { data?: unknown }
    : null
  if (!Array.isArray(response?.data)) return null

  const submissions: SubmissionData[] = []
  const latestRows = response.data.slice(0, 1)
  for (const row of latestRows) {
    if (!Array.isArray(row)) continue
    const cells = row.map(stripHtml)
    const idCell = cells.find(cell => /^\d{4,}$/.test(cell))
    if (!idCell) continue
    const verdictCell = cells.find(cell => normalizeVerdict(cell) !== 'UNKNOWN' && !/^\d+$/.test(cell))
    if (!verdictCell) continue
    const language = cells.find(cell => /c\+\+|java|python|go|rust|pascal|clang|gcc/i.test(cell))
    const runtime = cells.find(cell => /\d+(?:\.\d+)?\s*(ms|s)\b/i.test(cell))
    const memory = cells.find(cell => /\d+(?:\.\d+)?\s*(kb|mb|kib|mib)\b/i.test(cell))
    const problem = cells.find(cell => /^[A-Za-z][A-Za-z0-9_+.-]*[-\s]\S+/.test(cell))
    const parsedProblem = parseVjudgeProblemText(problem)

    submissions.push({
      platform: 'vjudge',
      platformSubmissionId: `vj-${idCell}`,
      verdict: normalizeVerdict(verdictCell),
      rawVerdict: verdictCell,
      language,
      runtimeMs: runtime ? parseRuntimeMs(runtime) : undefined,
      memoryKb: memory ? parseMemoryKb(memory) : undefined,
      submittedAt: nowBeijing(),
      sourceUrl: `https://vjudge.net/solution/${idCell}`,
      rawJson: JSON.stringify({
        row: { texts: cells },
        _vjudgeProblem: problem,
        ...(parsedProblem
          ? {
            _vjudgeProblemId: parsedProblem.problemId,
            _vjudgeSourcePlatform: parsedProblem.sourcePlatform,
            _vjudgeSourceProblemId: parsedProblem.sourceProblemId,
          }
          : {}),
      }),
      ...(parsedProblem ? { _vjudgeProblemId: parsedProblem.problemId } : {}),
    } as any)
  }

  return pickFinalRealtimeSubmission(submissions)
}

export const acwingAdapter: SiteAdapter = {
  id: 'acwing',
  name: 'AcWing',
  domains: ['acwing.com', 'www.acwing.com'],
  homeUrl: 'https://www.acwing.com',
  injectOnProblemPage: true,

  matchProblem(url: string): boolean {
    return parseAcwingProblem(url) !== null
  },

  parseProblem(url: string): ProblemIdentity | null {
    return parseAcwingProblem(url)
  },

  matchSubmissionResult(url: string): boolean {
    try {
      const parsed = new URL(url)
      return (parsed.hostname === 'www.acwing.com' || parsed.hostname === 'acwing.com')
        && /^\/problem\/submission\/\d+\/?$/.test(parsed.pathname)
    } catch {
      return false
    }
  },

  parseSubmissionTables(tables: GenericTableData[], ctx: TableParseContext): SubmissionData[] {
    return scanBestTable(tables, 'acwing', 'ac', ctx)
  },

  injectHookScript(): string {
    return createFrontendVerdictHookScript(this.id)
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    const frontendSubmission = parseFrontendVerdictPayload(raw, this.id, 'ac')
    if (frontendSubmission) return frontendSubmission
    return parseRealtimeTablePayload(raw, this.parseSubmissionTables!.bind(this))
  },

  resolveProblemIdentity(_submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
    return resolveProblemIdentityFromBrowserTitle(this, raw)
  },
}

export const nowcoderAdapter: SiteAdapter = {
  id: 'nowcoder',
  name: 'Nowcoder',
  domains: ['nowcoder.com', 'www.nowcoder.com', 'ac.nowcoder.com'],
  homeUrl: 'https://www.nowcoder.com',
  injectOnProblemPage: true,

  matchProblem(url: string): boolean {
    return parseNowcoderProblem(url) !== null
  },

  parseProblem(url: string): ProblemIdentity | null {
    return parseNowcoderProblem(url)
  },

  matchSubmissionResult(_url: string): boolean {
    return false
  },

  parseSubmissionTables(tables: GenericTableData[], ctx: TableParseContext): SubmissionData[] {
    const table = selectBestSubmissionTable(tables)
    if (!table) return []

    const probIdx = findColumnIndex(table.headers || [], ['题号'])
    return scanGenericSubmissionTable(table, {
      platform: 'nowcoder',
      submissionPrefix: 'nc',
      now: ctx.now,
    }).map((submission) => {
      let texts: string[] = []
      try {
        texts = JSON.parse(submission.rawJson || '{}')?.row?.texts || []
      } catch { /* ignore */ }
      return {
        ...submission,
        _ncProbLetter: probIdx >= 0 ? texts[probIdx] : undefined,
      } as any
    })
  },

  injectHookScript(): string {
    return createFrontendVerdictHookScript(this.id)
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    if (!parseNowcoderProblem(raw.pageUrl)) return null
    const frontendSubmission = parseFrontendVerdictPayload(raw, this.id, 'nc')
    if (frontendSubmission) return frontendSubmission
    return parseRealtimeTablePayload(raw, this.parseSubmissionTables!.bind(this))
  },

  resolveProblemIdentity(submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
    const identity = resolveProblemIdentityFromBrowserTitle(this, raw)
    if (identity) return identity

    const problemLetter = (submission as any)._ncProbLetter
    const contestMatch = raw.pageUrl.match(/\/contest\/(\d+)/)
    if (contestMatch && typeof problemLetter === 'string' && problemLetter.trim()) {
      const contestId = contestMatch[1]
      const problemIndex = problemLetter.trim()
      return {
        platform: this.id,
        platformProblemId: `contest-${contestId}-${problemIndex}`,
        canonicalUrl: `https://ac.nowcoder.com/acm/contest/${contestId}/${problemIndex}`,
        contestId,
        problemIndex,
        confidence: 'url',
      }
    }

    return null
  },
}

export const vjudgeAdapter: SiteAdapter = {
  id: 'vjudge',
  name: 'VJudge',
  domains: ['vjudge.net', 'www.vjudge.net'],
  homeUrl: 'https://vjudge.net',
  injectOnProblemPage: true,

  matchProblem(url: string): boolean {
    return parseVjudgeProblem(url) !== null
  },

  parseProblem(url: string): ProblemIdentity | null {
    return parseVjudgeProblem(url)
  },

  matchSubmissionResult(url: string): boolean {
    try {
      const parsed = new URL(url)
      return (parsed.hostname === 'vjudge.net' || parsed.hostname === 'www.vjudge.net')
        && (
          /^\/problem\/view\/submission\/\d+\/?$/.test(parsed.pathname)
          || /^\/status\/?$/.test(parsed.pathname)
          || (/^\/contest\/\d+\/?$/.test(parsed.pathname) && parsed.hash.startsWith('#status'))
        )
    } catch {
      return false
    }
  },

  parseSubmissionTables(tables: GenericTableData[], ctx: TableParseContext): SubmissionData[] {
    return scanBestTable(tables, 'vjudge', 'vj', ctx)
      .map(attachVjudgeRawProblemContext)
  },

  injectHookScript(): string {
    return `${createVjudgeStatusHookScript()}\n${createFrontendVerdictHookScript(this.id)}`
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    const frontendSubmission = parseFrontendVerdictPayload(raw, this.id, 'vj')
    if (frontendSubmission) return frontendSubmission
    const statusSubmission = parseVjudgeStatusData(raw)
    if (statusSubmission) return statusSubmission
    return parseRealtimeTablePayload(raw, this.parseSubmissionTables!.bind(this))
  },

  resolveProblemIdentity(_submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
    const identity = resolveProblemIdentityFromBrowserTitle(this, raw)
    if (identity) return identity

    try {
      const parsed = new URL(raw.pageUrl)
      const contestMatch = parsed.pathname.match(/\/contest\/(\d+)/)
      const problemLetter = parsed.hash.match(/#status\/[^/]+\/([A-Za-z0-9]+)/)?.[1]
        ?? parsed.hash.match(/#problem\/([A-Za-z0-9]+)/)?.[1]
      if (contestMatch && problemLetter) {
        const contestId = contestMatch[1]
        return {
          platform: this.id,
          platformProblemId: `contest-${contestId}-${problemLetter}`,
          canonicalUrl: `https://vjudge.net/contest/${contestId}#problem/${problemLetter}`,
          contestId,
          problemIndex: problemLetter,
          confidence: 'url',
        }
      }
    } catch { /* ignore */ }

    return null
  },
}
