import type { ProblemIdentity, SubmissionData } from '../../../shared/types'
import { nowBeijing } from '../../../shared/time'
import type { SiteAdapter, SubmissionDetectionPayload } from '../../types'
import { normalizeVerdict } from '../../verdictMap'
import { cleanBrowserProblemTitle } from '../../../parsers/browserTitle'

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function getString(record: Record<string, unknown> | null, keys: string[]): string | undefined {
  if (!record) return undefined
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function getValue(record: Record<string, unknown> | null, keys: string[]): unknown {
  if (!record) return undefined
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}

function getNestedRecord(record: Record<string, unknown> | null, path: string[]): Record<string, unknown> | null {
  let current: unknown = record
  for (const key of path) {
    const currentRecord = getRecord(current)
    if (!currentRecord) return null
    current = currentRecord[key]
  }
  return getRecord(current)
}

function getNestedString(record: Record<string, unknown> | null, paths: string[][]): string | undefined {
  for (const path of paths) {
    const parent = getNestedRecord(record, path.slice(0, -1))
    const value = getString(parent, [path[path.length - 1]])
    if (value) return value
  }
  return undefined
}

const LEETCODE_PENDING_PATTERN = /Pending|Started|Running|Judging|Evaluating|Compiling|正在判题|判题中|等待评测|排队|提交中|执行中|运行中|等待/i

// LeetCode can expose stale final-looking fields while nested judge/state fields
// still say pending, so all status-like fields are checked recursively.
function isPendingStatusField(key: string, value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false
  const text = String(value).trim()
  if (!text) return false
  if (/^state(?:_?code)?$/i.test(key)) return text.toUpperCase() !== 'SUCCESS'
  if (!/(state|status|verdict|judge|result)/i.test(key)) return false
  return LEETCODE_PENDING_PATTERN.test(text)
}

function hasPendingStatusSignal(value: unknown, key = '', depth = 0): boolean {
  if (!value || depth > 8) return false
  if (isPendingStatusField(key, value)) return true
  if (Array.isArray(value)) return value.some(item => hasPendingStatusSignal(item, key, depth + 1))
  if (typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>)
    .some(([childKey, childValue]) => hasPendingStatusSignal(childValue, childKey, depth + 1))
}

function normalizeResponse(response: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!response) return null
  return getNestedRecord(response, ['data', 'submissionDetails'])
    ?? getNestedRecord(response, ['data', 'submissionDetail'])
    ?? getNestedRecord(response, ['data', 'submission'])
    ?? getNestedRecord(response, ['submissionDetails'])
    ?? response
}

function mapStatusCode(code: string | undefined): string | undefined {
  switch (code) {
    case '10': return 'Accepted'
    case '11': return 'Wrong Answer'
    case '12': return 'Memory Limit Exceeded'
    case '13': return 'Output Limit Exceeded'
    case '14': return 'Time Limit Exceeded'
    case '15': return 'Runtime Error'
    case '20': return 'Compile Error'
    default: return undefined
  }
}

function getVerdictText(response: Record<string, unknown> | null): string | undefined {
  const text = getString(response, ['status_msg', 'statusMsg', 'status', 'statusDisplay', 'status_display', 'status_display_name'])
  if (text) return text
  return mapStatusCode(getString(response, ['status_code', 'statusCode']))
}

function extractSubmissionId(raw: SubmissionDetectionPayload, response: Record<string, unknown> | null): string {
  const fromResponse = getString(response, ['submission_id', 'submissionId', 'id'])
  if (fromResponse) return fromResponse
  const url = raw.requestUrl ?? ''
  const match = url.match(/\/submissions\/(?:detail\/)?(\d+)(?:\/check)?\/?/) ?? raw.pageUrl.match(/\/submissions\/(\d+)\/?/)
  return match?.[1] ?? `leetcode-${Date.now()}`
}

function parseRuntimeMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const match = value.match(/(\d+(?:\.\d+)?)\s*ms/i)
  if (!match) return undefined
  return Math.round(Number(match[1]))
}

function parseMemoryKb(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value !== 'string') return undefined
  const match = value.match(/(\d+(?:\.\d+)?)\s*(mb|kb)/i)
  if (!match) return undefined
  const amount = Number(match[1])
  return match[2].toLowerCase() === 'mb' ? Math.round(amount * 1024) : Math.round(amount)
}

function extractQuestionTitle(raw: SubmissionDetectionPayload, titleSlug?: string): string | undefined {
  return cleanBrowserProblemTitle(getString(getRecord(raw.meta), ['pageTitle']), {
    platform: 'leetcode-cn',
    platformProblemId: titleSlug,
  }) ?? undefined
}

export const leetcodeAdapter: SiteAdapter = {
  id: 'leetcode-cn',
  name: 'LeetCode.cn',
  domains: ['leetcode.cn', 'www.leetcode.cn'],
  homeUrl: 'https://leetcode.cn/problemset/',
  isSpa: true,

  matchProblem(url: string): boolean {
    try {
      const parsed = new URL(url)
      return this.domains.includes(parsed.hostname) && /^\/problems\/[^/]+\/?$/.test(parsed.pathname)
    } catch {
      return false
    }
  },

  parseProblem(url: string): ProblemIdentity | null {
    try {
      const parsed = new URL(url)
      const match = parsed.pathname.match(/^\/problems\/([^/]+)\/?$/)
      if (!match) return null
      const titleSlug = decodeURIComponent(match[1])
      return {
        platform: this.id,
        platformProblemId: titleSlug,
        canonicalUrl: `https://leetcode.cn/problems/${titleSlug}/`,
        confidence: 'url',
      }
    } catch {
      return null
    }
  },

  matchSubmissionResult(url: string): boolean {
    return /\/submissions\/(?:detail\/)?\d+(?:\/check)?\/?/.test(url) || /\/graphql\/?/.test(url)
  },

  injectHookScript(): string {
    return `(() => {
      const CHANNEL = '__algo_submission_v1';
      const ADAPTER_ID = 'leetcode-cn';
      const SUBMISSION_URL_RE = /\\/submissions\\/(?:detail\\/)?\\d+(?:\\/check)?\\/?/;
      const PAGE_SUBMISSION_RE = /\\/problems\\/([^/]+)\\/submissions\\/(\\d+)\\/?/;
      const SUBMIT_URL_RE = /\\/problems\\/[^/]+\\/submit\\/?/;
      const RUN_CODE_URL_RE = /\\/problems\\/[^/]+\\/(?:interpret_solution|run_code)\\/?/;
      const STATE_KEY = '__ALGO_LEETCODE_SUBMISSION_STATE__';
      const state = window[STATE_KEY] || {
        submittedIds: {},
        runIds: {}
      };
      window[STATE_KEY] = state;

      const markId = (bucket, id) => {
        if (!id) return;
        bucket[String(id)] = Date.now();
      };

      const cleanupIds = () => {
        const cutoff = Date.now() - 30 * 60 * 1000;
        for (const bucket of [state.submittedIds, state.runIds]) {
          for (const [id, at] of Object.entries(bucket)) {
            if (typeof at === 'number' && at < cutoff) delete bucket[id];
          }
        }
      };

      const detailOf = (json) => {
        if (!json || typeof json !== 'object') return null;
        return json?.data?.submissionDetails
          || json?.data?.submissionDetail
          || json?.submissionDetails
          || json?.submissionDetail
          || json;
      };

      const idFromUrl = (requestUrl) => {
        const match = String(requestUrl || '').match(/\\/submissions\\/(?:detail\\/)?(\\d+)(?:\\/check)?\\/?/);
        return match ? match[1] : '';
      };

      const idFromPayload = (json, requestUrl) => {
        const detail = detailOf(json);
        return String(
          detail?.id
          || detail?.submission_id
          || detail?.submissionId
          || json?.submission_id
          || json?.submissionId
          || json?.interpret_id
          || json?.interpretId
          || idFromUrl(requestUrl)
          || ''
        );
      };

      const isSubmissionDetailPayload = (json) => {
        return Boolean(
          json?.data?.submissionDetails
          || json?.data?.submissionDetail
          || json?.submissionDetails
          || json?.submissionDetail
        );
      };

      const report = (requestUrl, response) => {
        try {
          const payload = {
            adapterId: ADAPTER_ID,
            pageUrl: location.href,
            requestUrl: String(requestUrl),
            response,
            meta: {
              pageTitle: typeof document !== 'undefined' ? document.title : ''
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

      const hasSubmissionPayload = (json, requestUrl) => {
        try {
          const detail = detailOf(json);
          if (!detail || typeof detail !== 'object') return false;
          const id = detail.id || detail.submission_id || detail.submissionId || idFromUrl(requestUrl);
          const verdict = detail.status_msg || detail.statusMsg || detail.status || detail.statusDisplay || detail.status_display || detail.statusCode || detail.status_code;
          return Boolean(id && verdict);
        } catch (_) {
          return false;
        }
      };
      const PENDING_RE = /Pending|Started|Running|Judging|Evaluating|Compiling|正在判题|判题中|等待评测|排队|提交中|执行中|运行中|等待/i;
      const isPendingStatusField = (key, value) => {
        const text = String(value ?? '').trim();
        if (!text) return false;
        if (/^state(?:_?code)?$/i.test(String(key || ''))) return text.toUpperCase() !== 'SUCCESS';
        if (!/(state|status|verdict|judge|result)/i.test(String(key || ''))) return false;
        return PENDING_RE.test(text);
      };
      const hasPendingStatusSignal = (value, key = '', depth = 0) => {
        if (!value || depth > 8) return false;
        if (isPendingStatusField(key, value)) return true;
        if (Array.isArray(value)) return value.some((item) => hasPendingStatusSignal(item, key, depth + 1));
        if (typeof value !== 'object') return false;
        return Object.entries(value).some(([childKey, childValue]) => hasPendingStatusSignal(childValue, childKey, depth + 1));
      };
      const isPendingPayload = (json) => {
        try {
          if (hasPendingStatusSignal(json)) return true;
          const detail = detailOf(json);
          const state = String(detail?.state || detail?.stateCode || detail?.state_code || json?.state || json?.stateCode || json?.state_code || '');
          if (state && state.toUpperCase() !== 'SUCCESS') return true;
          const verdict = String(detail?.status_msg || detail?.statusMsg || detail?.status || detail?.statusDisplay || detail?.status_display || '');
          return PENDING_RE.test(verdict);
        } catch (_) {
          return false;
        }
      };

      const shouldReportJson = (requestUrl, json) => {
        const url = String(requestUrl || '');
        cleanupIds();

        if (RUN_CODE_URL_RE.test(url)) {
          markId(state.runIds, idFromPayload(json, requestUrl));
          return false;
        }

        if (SUBMIT_URL_RE.test(url)) {
          markId(state.submittedIds, idFromPayload(json, requestUrl));
          return false;
        }

        if (SUBMISSION_URL_RE.test(url)) {
          const id = idFromPayload(json, requestUrl);
          if (id && state.runIds[id]) return false;
          if (id && state.submittedIds[id] && !isPendingPayload(json) && hasSubmissionPayload(json, requestUrl)) return true;
          return false;
        }

        if (/\\/graphql\\/?/.test(url)) {
          const path = typeof location !== 'undefined' ? String(location.pathname || '') : '';
          return /\\/submissions\\/\\d+\\/?/.test(path) && isSubmissionDetailPayload(json) && !isPendingPayload(json) && hasSubmissionPayload(json, requestUrl);
        }

        return false;
      };

      const extractPageVerdict = (text) => {
        if (!text) return '';
        if (PENDING_RE.test(text)) return '';
        if (/Accepted/i.test(text) || /\\bAC\\b/.test(text) || /(^|\\s)通过(\\s|$)/.test(text)) return 'Accepted';
        if (/Wrong Answer/i.test(text) || /答案错误|解答错误/.test(text)) return 'Wrong Answer';
        if (/Time Limit Exceeded/i.test(text) || /超出时间限制|时间超限/.test(text)) return 'Time Limit Exceeded';
        if (/Memory Limit Exceeded/i.test(text) || /超出内存限制|内存超限/.test(text)) return 'Memory Limit Exceeded';
        if (/Runtime Error/i.test(text) || /运行错误|执行出错/.test(text)) return 'Runtime Error';
        if (/Compile Error/i.test(text) || /编译错误/.test(text)) return 'Compile Error';
        return '';
      };
      const hasPageFinalEvidence = (text, verdict) => {
        if (!verdict) return false;
        if (/Runtime|Memory|运行时间|内存|内存消耗|耗时|用时|\\d+(?:\\.\\d+)?\\s*ms|\\d+(?:\\.\\d+)?\\s*(MB|KB)/i.test(text)) return true;
        return /Compile Error|Compilation Error|编译错误/i.test(verdict) && /error|错误|stderr|编译/i.test(text);
      };

      // Submission pages can show old accepted text before the latest judge state
      // settles, so the fallback scan requires both a final verdict and final-page
      // evidence such as runtime or memory.
      const reportCurrentSubmissionPage = () => {
        try {
          if (typeof document === 'undefined' || !document.body) return;
          const pageMatch = location.pathname.match(PAGE_SUBMISSION_RE);
          if (!pageMatch) return;
          const text = document.body.innerText || document.body.textContent || '';
          const verdict = extractPageVerdict(text);
          if (!verdict) return;
          if (!hasPageFinalEvidence(text, verdict)) return;
          const runtimeMatch = text.match(/(\\d+(?:\\.\\d+)?)\\s*ms/i);
          const memoryMatch = text.match(/(\\d+(?:\\.\\d+)?)\\s*(MB|KB)/i);
          report(location.href, {
            state: 'SUCCESS',
            id: pageMatch[2],
            title_slug: decodeURIComponent(pageMatch[1]),
            status_msg: verdict,
            runtime: runtimeMatch ? runtimeMatch[0] : undefined,
            memory: memoryMatch ? memoryMatch[0] : undefined,
            _source: 'submission-page-scan'
          });
        } catch (_) {}
      };

      const installNetworkHooks = () => {
        if (window.__ALGO_LEETCODE_NETWORK_HOOK_INSTALLED__) return;
        window.__ALGO_LEETCODE_NETWORK_HOOK_INSTALLED__ = true;

        const originalFetch = window.fetch;
        if (typeof originalFetch === 'function') {
        window.fetch = async function(input, init) {
          const response = await originalFetch.apply(this, arguments);
          try {
            const requestUrl = typeof input === 'string' ? input : input && input.url;
            if (requestUrl) {
              response.clone().json().then((json) => {
                if (shouldReportJson(requestUrl, json)) report(requestUrl, json);
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
            return originalOpen.apply(this, arguments);
          };
          OriginalXHR.prototype.send = function() {
            this.addEventListener('load', function() {
              try {
                const requestUrl = this.__algoRequestUrl;
                if (!requestUrl) return;
                const contentType = this.getResponseHeader && this.getResponseHeader('content-type');
                if (contentType && !String(contentType).includes('json')) return;
                const json = JSON.parse(this.responseText);
                if (shouldReportJson(requestUrl, json)) report(requestUrl, json);
              } catch (_) {}
            });
            return originalSend.apply(this, arguments);
          };
        }
      };

      installNetworkHooks();
      [0, 600, 1500, 3000, 6000].forEach((delay) => setTimeout(reportCurrentSubmissionPage, delay));
      try {
        if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
          const observer = new MutationObserver(reportCurrentSubmissionPage);
          observer.observe(document.body, { childList: true, subtree: true, characterData: true });
          setTimeout(() => observer.disconnect(), 12000);
        }
      } catch (_) {}
    })();`
  },

  parseSubmissionResult(raw: SubmissionDetectionPayload): SubmissionData | null {
    const originalResponse = getRecord(raw.response)
    const response = normalizeResponse(originalResponse)
    if (!response) return null

    const state = getString(response, ['state', 'stateCode', 'state_code'])
      ?? getString(originalResponse, ['state', 'stateCode', 'state_code'])
    if (state && state.toUpperCase() !== 'SUCCESS') return null
    if (hasPendingStatusSignal(originalResponse) || hasPendingStatusSignal(response)) return null

    const verdictText = getVerdictText(response)
    if (!verdictText) return null
    if (LEETCODE_PENDING_PATTERN.test(verdictText)) return null
    const submissionId = extractSubmissionId(raw, response)
    const rawJson = JSON.stringify({
      ...response,
      _leetcodeTitleSlug: getString(response, ['title_slug', 'titleSlug', 'questionTitleSlug'])
        ?? getNestedString(response, [['question', 'titleSlug']])
        ?? getNestedString(originalResponse, [['data', 'question', 'titleSlug']]),
      _leetcodeFrontendQuestionId: getString(response, ['frontend_question_id', 'frontendQuestionId', 'question_id', 'questionId', 'questionFrontendId'])
        ?? getNestedString(response, [['question', 'questionFrontendId']]),
      _leetcodeQuestionTitle: extractQuestionTitle(raw),
    })

    const verdict = normalizeVerdict(verdictText)
    if (verdict === 'TESTING' || verdict === 'UNKNOWN') return null

    return {
      platform: this.id,
      platformSubmissionId: submissionId,
      verdict,
      rawVerdict: verdictText,
      language: getString(response, ['lang', 'lang_name', 'langName', 'pretty_lang', 'code_lang', 'language', 'language_name']),
      submittedAt: nowBeijing(),
      runtimeMs: parseRuntimeMs(getValue(response, ['runtime', 'runtimeDisplay', 'runtime_display', 'status_runtime', 'elapsed_time'])),
      memoryKb: parseMemoryKb(getValue(response, ['memory', 'memoryDisplay', 'memory_display', 'memory_usage', 'status_memory'])),
      sourceUrl: raw.pageUrl,
      rawJson,
    }
  },

  resolveProblemIdentity(_submission: SubmissionData, raw: SubmissionDetectionPayload): ProblemIdentity | null {
    const originalResponse = getRecord(raw.response)
    const response = normalizeResponse(originalResponse)
    const titleSlug = getString(response, ['title_slug', 'titleSlug', 'questionTitleSlug'])
      ?? getNestedString(response, [['question', 'titleSlug']])
      ?? getNestedString(originalResponse, [['data', 'question', 'titleSlug']])
      ?? (() => {
      try {
        const match = new URL(raw.pageUrl).pathname.match(/^\/problems\/([^/]+)\/?/)
        return match?.[1]
      } catch {
        return undefined
      }
    })()

    if (!titleSlug) return null
    return {
      platform: this.id,
      platformProblemId: titleSlug,
      canonicalUrl: `https://leetcode.cn/problems/${titleSlug}/`,
      title: extractQuestionTitle(raw, titleSlug),
      problemIndex: getString(response, ['frontend_question_id', 'frontendQuestionId', 'question_id', 'questionId', 'questionFrontendId'])
        ?? getNestedString(response, [['question', 'questionFrontendId']]),
      confidence: 'url',
    }
  },
}
