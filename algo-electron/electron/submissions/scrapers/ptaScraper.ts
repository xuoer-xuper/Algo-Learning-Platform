import type { SubmissionData, Verdict } from '../../shared/types'
import { nowBeijing } from '../../shared/time'
import type { SubmissionDetectionPayload, SubmissionScrapeContext } from '../../adapters/types'

function mapVerdict(result: string): Verdict {
  const value = result.trim().toLowerCase()
  if (!value) return 'UNKNOWN'
  if (value.includes('答案正确') || value.includes('通过') || value.includes('accepted')) return 'AC'
  if (value.includes('部分正确')) return 'WA'
  if (value.includes('答案错误') || value.includes('wrong answer') || value.includes('wrong')) return 'WA'
  if (value.includes('时间超限') || value.includes('超出时间限制') || value.includes('运行超时') || value.includes('time limit')) return 'TLE'
  if (value.includes('内存超限') || value.includes('超出内存限制') || value.includes('memory limit')) return 'MLE'
  if (value.includes('输出超限') || value.includes('超出输出限制') || value.includes('output limit')) return 'OLE'
  if (value.includes('段错误') || value.includes('浮点错误') || value.includes('非零返回') || value.includes('多种错误') || value.includes('运行错误') || value.includes('运行时错误') || value.includes('runtime error')) return 'RE'
  if (value.includes('编译错误') || value.includes('compile error') || value.includes('compilation error')) return 'CE'
  if (value.includes('格式错误') || value.includes('presentation error')) return 'PE'
  if (value.includes('等待评测') || value.includes('正在评测') || value.includes('排队中') || value.includes('评测中') || value.includes('testing') || value.includes('pending') || value.includes('judging') || value.includes('running')) return 'TESTING'
  if (value.includes('已被覆盖') || value.includes('内部错误') || value.includes('skipped')) return 'SKIPPED'

  const abbrMap: Record<string, Verdict> = { ac: 'AC', wa: 'WA', tle: 'TLE', mle: 'MLE', re: 'RE', ce: 'CE', pe: 'PE', ole: 'OLE' }
  return abbrMap[value] ?? 'UNKNOWN'
}

function findColumnIndex(headers: string[], keywords: string[]): number {
  return headers.findIndex(header => keywords.some(keyword => header.toLowerCase().includes(keyword.toLowerCase())))
}

function extractStableId(links: string[], prefix: string): string | null {
  for (const link of links) {
    if (!link) continue
    const match = link.match(/\/(\d{4,})\/?$/)
    if (match) return `${prefix}-${match[1]}`
  }
  return null
}

function parseRuntimeMs(raw: string): number | undefined {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(ms|s)\b/i)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  return match[2].toLowerCase() === 's' ? Math.round(value * 1000) : Math.round(value)
}

function parseMemoryKb(raw: string): number | undefined {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(kb|mb|kib|mib)\b/i)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  return match[2].toLowerCase().startsWith('m') ? Math.round(value * 1024) : Math.round(value)
}

function extractPtaProblemIdFromUrl(currentUrl: string): string | undefined {
  try {
    const parsed = new URL(currentUrl)
    const typeMatch = parsed.pathname.match(/^\/problem-sets\/(\d+)\/(?:exam\/)?problems\/type\/\d+/)
    const typeProblemId = parsed.searchParams.get('problemSetProblemId')
      ?? parsed.searchParams.get('problemId')
    if (typeMatch && typeProblemId) return `${typeMatch[1]}-${typeProblemId}`

    const problemMatch = parsed.pathname.match(/^\/problem-sets\/(\d+)\/(?:exam\/problems|exam-problems|problems)\/(\d+)/)
    if (problemMatch) return `${problemMatch[1]}-${problemMatch[2]}`
  } catch { /* ignore */ }
  return undefined
}

function extractPtaSubmissionIdFromLinks(links: unknown): string | undefined {
  if (!Array.isArray(links)) return undefined
  for (const link of links) {
    if (typeof link !== 'string') continue
    const match = link.match(/\/submissions\/(\d+)\b/)
    if (match) return match[1]
  }
  return undefined
}

function extractLanguage(raw: string): string | undefined {
  const value = raw.replace(/\s+/g, ' ').trim()
  const patterns = [
    /(?:^|[^A-Za-z0-9_+])((?:GNU\s+)?C\+\+\s*\d*(?:\s*\([^)]+\))?)(?=$|[^A-Za-z0-9_+])/i,
    /(?:^|[^A-Za-z0-9_])((?:JavaScript|TypeScript|Python\s*\d*|Java|Go|Rust|Pascal|GCC|Clang)(?:\s*\([^)]+\))?)(?=$|[^A-Za-z0-9_])/i,
    /(?:^|[^A-Za-z0-9_+])((?:GNU\s+)?C(?:\s*\([^)]+\))?)(?=$|[^A-Za-z0-9_+])/i,
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    const language = match?.[1]?.trim().replace(/\s+/g, ' ')
    if (language) return language
  }
  return undefined
}

export const EXTRACT_PTA_SUBMISSIONS_SCRIPT = `
  (() => {
    const tables = document.querySelectorAll('table')
    if (!tables.length) return { error: 'no table' }
    let targetTable = null
    for (const t of tables) {
      const ths = Array.from(t.querySelectorAll('thead th, thead td')).map(th => th.textContent.trim())
      const hasResult = ths.some(t => t.includes('评测结果') || t.includes('结果') || t.includes('Score') || t.includes('Result') || t.includes('状态') || t.includes('Status'))
      const hasSubmit = ths.some(t => t.includes('提交') || t.includes('Submit') || t.includes('语言') || t.includes('Language') || t.includes('编译器') || t.includes('Compiler'))
      if (hasResult || hasSubmit) {
        targetTable = t
        break
      }
    }
    if (!targetTable) {
      let maxRows = 0
      for (const t of tables) {
        const rowCount = t.querySelectorAll('tbody tr').length
        if (rowCount > maxRows) { maxRows = rowCount; targetTable = t }
      }
    }
    if (!targetTable) return { error: 'no submission table' }
    let headers = Array.from(targetTable.querySelectorAll('thead th, thead td')).map(c => {
      const clone = c.cloneNode(true); clone.querySelectorAll('script,style,noscript').forEach(s => s.remove()); return clone.textContent.trim()
    })
    if (!headers.length || headers.length < 2) {
      const firstRow = targetTable.querySelector('tr')
      if (firstRow) {
        headers = Array.from(firstRow.querySelectorAll('th, td')).map(c => {
          const clone = c.cloneNode(true); clone.querySelectorAll('script,style,noscript').forEach(s => s.remove()); return clone.textContent.trim()
        })
      }
    }
    const rows = []
    for (const row of targetTable.querySelectorAll('tbody tr')) {
      const cells = row.querySelectorAll('td')
      if (cells.length < 2) continue
      rows.push({
        texts: Array.from(cells).map(c => {
          const clone = c.cloneNode(true); clone.querySelectorAll('script,style,noscript').forEach(s => s.remove()); return clone.textContent.trim()
        }),
        links: Array.from(cells).map(c => { const a = c.querySelector('a'); return a ? a.href : '' }),
        allLinks: Array.from(cells).map(c => Array.from(c.querySelectorAll('a')).map(a => a.href)),
        htmls: Array.from(cells).map(c => c.innerHTML),
        classNames: Array.from(cells).map(c => c.className || '')
      })
    }
    return { headers, rows }
  })()
`

export function createPtaRealtimeHookScript(adapterId = 'pta'): string {
  return `(() => {
    const CHANNEL = '__algo_submission_v1';
    const ADAPTER_ID = ${JSON.stringify(adapterId)};
    const INTENT_KEY = '__ALGO_SUBMIT_INTENT_pta';
    const BLOCKED_INTENT_KEY = '__ALGO_BLOCKED_SUBMIT_INTENT_pta';
    const INSTALLED_KEY = '__ALGO_PTA_REALTIME_HOOK_INSTALLED__';
    if (window[INSTALLED_KEY]) return;
    window[INSTALLED_KEY] = true;

    const now = () => Date.now();
    const isSubmissionPage = () => /\\/problem-sets\\/\\d+\\/(?:exam\\/)?submissions\\/?/.test(location.pathname)
      || /\\/submissions\\/\\d+\\/?/.test(location.pathname);
    const isSingleSubmissionPage = () => /\\/submissions\\/\\d+\\/?/.test(location.pathname);
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
    const sendPayload = (payload) => {
      if (window[CHANNEL] && typeof window[CHANNEL].reportSubmission === 'function') {
        window[CHANNEL].reportSubmission(payload);
      } else {
        const targetWindow = window.top && window.top !== window ? window.top : window;
        targetWindow.postMessage({ channel: CHANNEL, payload }, '*');
      }
    };
    const writeIntent = (intent) => {
      try {
        sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
      } catch (_) {}
    };
    const clearBlockedIntent = () => {
      try {
        sessionStorage.removeItem(BLOCKED_INTENT_KEY);
      } catch (_) {}
    };
    const markBlockedIntent = (source) => {
      try {
        sessionStorage.setItem(BLOCKED_INTENT_KEY, JSON.stringify({ at: now(), source }));
      } catch (_) {}
    };
    const hasRecentBlockedIntent = () => {
      try {
        const intent = JSON.parse(sessionStorage.getItem(BLOCKED_INTENT_KEY) || 'null') || {};
        return typeof intent.at === 'number' && now() - intent.at < 8 * 1000;
      } catch (_) {
        return false;
      }
    };
    const createSubmitIntentId = () => {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
      } catch (_) {}
      return 'pta-intent-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    };
    const markSubmitIntent = (source) => {
      clearBlockedIntent();
      const intent = readIntent();
      const reuseExistingId = source !== 'click'
        && source !== 'form'
        && typeof intent.id === 'string'
        && typeof intent.at === 'number'
        && now() - intent.at < 15 * 1000;
      writeIntent({
        ...intent,
        id: reuseExistingId ? intent.id : createSubmitIntentId(),
        at: now(),
        source,
        pageUrl: getTopPageUrl()
      });
    };
    const hasRecentSubmitIntent = () => {
      const intent = readIntent();
      return typeof intent.at === 'number' && now() - intent.at < 3 * 60 * 1000;
    };
    const maybeSubmitUrl = (requestUrl, method) => {
      const url = String(requestUrl || '').toLowerCase();
      const verb = String(method || '').toUpperCase();
      if (!verb || (verb !== 'POST' && verb !== 'PUT' && verb !== 'PATCH')) return false;
      if (hasRecentBlockedIntent()) return false;
      if (/\\/submissions\\/\\d+(?:[/?#]|$)/.test(url)) return false;
      if (/view|history|record-list|submission-list|last-submission|submission-detail/.test(url)) return false;
      const isPtaRequest = /problem-sets|pintia|api|exam/.test(url);
      const isJudgeRequest = /submit|submission|answer|solution|judge|record/.test(url);
      return isPtaRequest && isJudgeRequest;
    };

    const shouldScan = () => hasRecentSubmitIntent() && (isSingleSubmissionPage() || isSubmissionPage());
    const extract = async () => (${EXTRACT_PTA_SUBMISSIONS_SCRIPT});
    const report = async () => {
      try {
        if (!shouldScan()) return;
        const response = await extract();
        if (!response) return;
        const payload = {
          adapterId: ADAPTER_ID,
          pageUrl: getTopPageUrl(),
          requestUrl: location.href,
          response,
          meta: {
            pageTitle: typeof document !== 'undefined' ? document.title : '',
            submitIntent: hasRecentSubmitIntent()
          },
          detectedAt: new Date().toISOString(),
        };
        sendPayload(payload);
      } catch (_) {}
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
    const pendingPattern = /等待评测|正在评测|评测中|排队中|Pending|Judging|Running|Testing/i;
    const verdictPatterns = [
      { verdict: '答案正确', pattern: /答案正确|Accepted|(^|\\s)通过(\\s|$)/i },
      { verdict: '部分正确', pattern: /部分正确|Partially\\s+Accepted/i },
      { verdict: '答案错误', pattern: /答案错误|Wrong\\s+Answer/i },
      { verdict: '时间超限', pattern: /时间超限|运行超时|Time\\s+Limit/i },
      { verdict: '内存超限', pattern: /内存超限|Memory\\s+Limit/i },
      { verdict: '运行错误', pattern: /运行错误|运行时错误|Runtime\\s+Error/i },
      { verdict: '编译错误', pattern: /编译错误|Compile\\s+Error|Compilation\\s+Error/i },
      { verdict: '格式错误', pattern: /格式错误|Presentation\\s+Error/i },
      { verdict: '输出超限', pattern: /输出超限|Output\\s+Limit/i }
    ];
    const pickVerdict = (text) => {
      if (!text || pendingPattern.test(text)) return '';
      for (const item of verdictPatterns) {
        if (item.pattern.test(text)) return item.verdict;
      }
      return '';
    };
    const isLikelyResultPopup = (element) => {
      if (!element || element.nodeType !== 1) return false;
      const marker = String((element.id || '') + ' ' + (element.className || '') + ' ' + (element.getAttribute('role') || '')).toLowerCase();
      return /modal|dialog|toast|message|alert|notice|result|status|judge|score|评测|结果|状态|得分/.test(marker);
    };
    const popupCandidatesFrom = (node) => {
      const element = node && node.nodeType === 1 ? node : node?.parentElement;
      const candidates = [];
      let current = element;
      for (let depth = 0; current && depth < 5; depth++) {
        if (isLikelyResultPopup(current)) candidates.push(current);
        current = current.parentElement;
      }
      try {
        document.querySelectorAll('[role="dialog"],[class*="modal"],[class*="dialog"],[class*="toast"],[class*="message"],[class*="alert"],[class*="notice"],[class*="result"],[class*="status"],[class*="score"],[id*="modal"],[id*="dialog"],[id*="result"],[id*="status"]').forEach((item) => candidates.push(item));
      } catch (_) {}
      return Array.from(new Set(candidates)).filter(Boolean);
    };
    const reportFrontendVerdict = (candidate, text, verdictText) => {
      try {
        if (!hasRecentSubmitIntent()) return;
        const intent = readIntent();
        if (!intent.id) return;
        const payload = {
          adapterId: ADAPTER_ID,
          pageUrl: intent.pageUrl || location.href,
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
          detectedAt: new Date().toISOString(),
        };
        sendPayload(payload);
      } catch (_) {}
    };
    const scanFrontendVerdict = (node) => {
      if (!hasRecentSubmitIntent()) return;
      for (const candidate of popupCandidatesFrom(node || document.body)) {
        const text = textOf(candidate);
        if (!text || text.length > 4000) continue;
        const verdictText = pickVerdict(text);
        if (!verdictText) continue;
        setTimeout(() => {
          const latestText = textOf(candidate);
          const latestVerdictText = pickVerdict(latestText);
          if (latestVerdictText === verdictText) reportFrontendVerdict(candidate, latestText, latestVerdictText);
        }, 900);
        return;
      }
    };
    const scanDocument = () => {
      if (document.body) scanFrontendVerdict(document.body);
    };
    const scheduleRealtimeScans = () => {
      [300, 800, 1500, 3000, 6000, 10000].forEach((delay) => {
        setTimeout(report, delay);
        setTimeout(scanDocument, delay);
      });
    };

    try {
      const isBlockedSubmitControlText = (text) => {
        const value = String(text || '').replace(/\\s+/g, ' ').trim();
        if (!value) return false;
        return /查看|上次|记录|详情|历史|列表|状态|结果|我的提交|提交记录|View|Last|History|Record|Detail|Status|Result|自测|运行|调试|样例|Run|Test|Debug|Sample/i.test(value);
      };
      const isSubmitIntentControlText = (text) => {
        const value = String(text || '').replace(/\\s+/g, ' ').trim();
        if (!value) return false;
        if (isBlockedSubmitControlText(value)) return false;
        return /提交|Submit/i.test(value);
      };
      const submitIntentTargetSelector = 'button,input,a,[role="button"],[class*="button"],[class*="Button"],[class*="btn"],[class*="Btn"],[class*="submit"],[class*="Submit"],[data-testid*="submit"],[data-test*="submit"]';
      document.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target.closest(submitIntentTargetSelector) : null;
        const text = String(target?.textContent || target?.value || target?.getAttribute?.('aria-label') || target?.getAttribute?.('title') || '').trim();
        if (isSubmitIntentControlText(text)) {
          markSubmitIntent('click');
          scheduleRealtimeScans();
        } else if (isBlockedSubmitControlText(text)) {
          markBlockedIntent('click');
        }
      }, true);
      document.addEventListener('pointerdown', (event) => {
        const target = event.target && event.target.closest ? event.target.closest(submitIntentTargetSelector) : null;
        const text = String(target?.textContent || target?.value || target?.getAttribute?.('aria-label') || target?.getAttribute?.('title') || '').trim();
        if (isSubmitIntentControlText(text)) {
          markSubmitIntent('click');
          scheduleRealtimeScans();
        } else if (isBlockedSubmitControlText(text)) {
          markBlockedIntent('pointerdown');
        }
      }, true);
      document.addEventListener('submit', () => {
        markSubmitIntent('form');
        scheduleRealtimeScans();
      }, true);
    } catch (_) {}

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' ? input : input && input.url;
        const method = init?.method || (typeof input === 'object' && input ? input.method : '');
        const isSubmitRequest = maybeSubmitUrl(requestUrl, method);
        if (isSubmitRequest) markSubmitIntent('fetch');
        const response = await originalFetch.apply(this, arguments);
        try {
          if (isSubmitRequest) {
            scheduleRealtimeScans();
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
        const isSubmitRequest = maybeSubmitUrl(this.__algoRequestUrl, this.__algoRequestMethod);
        if (isSubmitRequest) markSubmitIntent('xhr');
        this.addEventListener('load', function() {
          try {
            if (isSubmitRequest) {
              scheduleRealtimeScans();
            }
          } catch (_) {}
        });
        return originalSend.apply(this, arguments);
      };
    }

    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        report();
        scanDocument();
      }, 600);
    };
    const installObserver = () => {
      try {
        if (window.__ALGO_PTA_MUTATION_OBSERVER_INSTALLED__) return true;
        if (typeof MutationObserver === 'undefined' || !document.body) return false;
        window.__ALGO_PTA_MUTATION_OBSERVER_INSTALLED__ = true;
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        return true;
      } catch (_) {
        return false;
      }
    };

    [0, 1000, 2500, 5000, 9000].forEach((delay) => setTimeout(report, delay));
    [0, 300, 1000, 2500, 5000].forEach((delay) => setTimeout(installObserver, delay));
  })();`
}

export async function scrapePta(browserHost: SubmissionScrapeContext): Promise<SubmissionData[]> {
  const currentUrl = browserHost.getUrl()
  const data = await browserHost.executeScript(EXTRACT_PTA_SUBMISSIONS_SCRIPT)
  return parsePtaSubmissionData(currentUrl, data)
}

export function parsePtaFrontendVerdictPayload(raw: SubmissionDetectionPayload): SubmissionData | null {
  const response = raw.response && typeof raw.response === 'object'
    ? raw.response as { _source?: unknown; submitId?: unknown; text?: unknown; verdictText?: unknown; links?: unknown }
    : null
  if (response?._source !== 'frontend-verdict-observer') return null
  if (typeof response.submitId !== 'string' || !response.submitId.trim()) return null

  const text = typeof response.text === 'string' ? response.text : ''
  const rawVerdict = typeof response.verdictText === 'string' && response.verdictText.trim()
    ? response.verdictText.trim()
    : text
  const verdict = mapVerdict(text) !== 'UNKNOWN' && mapVerdict(text) !== 'TESTING'
    ? mapVerdict(text)
    : mapVerdict(rawVerdict)
  if (verdict === 'UNKNOWN' || verdict === 'TESTING') return null

  const submissionId = extractPtaSubmissionIdFromLinks(response.links)
  const sourceUrl = submissionId
    ? `https://pintia.cn/submissions/${submissionId}`
    : raw.pageUrl
  const ptaProblemId = extractPtaProblemIdFromUrl(raw.pageUrl)
  const rawJson = {
    _source: 'frontend-verdict-observer',
    text: text.slice(0, 1000),
    links: Array.isArray(response.links) ? response.links.slice(0, 10) : undefined,
    _ptaProblemId: ptaProblemId,
  }

  return {
    platform: 'pta',
    platformSubmissionId: submissionId ? `pta-${submissionId}` : `pta-rt-${response.submitId}`,
    verdict,
    rawVerdict,
    language: extractLanguage(text),
    runtimeMs: parseRuntimeMs(text),
    memoryKb: parseMemoryKb(text),
    submittedAt: nowBeijing(),
    sourceUrl,
    rawJson: JSON.stringify(rawJson),
  } as any
}

export function parsePtaSubmissionData(currentUrl: string, data: any): SubmissionData[] {
  const urlSetIdMatch = currentUrl.match(/\/problem-sets\/(\d+)/)
  const urlSetId = urlSetIdMatch ? urlSetIdMatch[1] : null

  if (!data || data.error || !data.rows?.length) return []

  const headers = data.headers || []
  const idIdx = findColumnIndex(headers, ['提交编号', 'Submission ID', 'ID'])
  let verdictIdx = findColumnIndex(headers, ['评测结果', '结果', 'Score', 'Result', '状态', 'Status', '评判结果', '得分'])
  const languageIdx = findColumnIndex(headers, ['编译器', '语言', 'Language', 'Compiler'])
  const runtimeIdx = findColumnIndex(headers, ['耗时', '运行时间', 'Time'])
  const memoryIdx = findColumnIndex(headers, ['内存', '使用内存', 'Memory'])
  const problemIdx = findColumnIndex(headers, ['题目', '问题', 'Problem'])

  if (verdictIdx === -1 && data.rows?.length) {
    const verdictKeywords = ['答案正确', '部分正确', '答案错误', '运行超时', '内存超限', '输出超限', '段错误', '浮点错误', '非零返回', '多种错误', '运行时错误', '编译错误', '格式错误', '等待评测', '正在评测', '已被覆盖', '内部错误', 'accepted', 'wrong', 'time limit', 'memory limit', 'runtime', 'compile', 'presentation', 'output limit']
    for (let col = 0; col < (data.rows[0].texts?.length || 0); col++) {
      let matchCount = 0
      for (const row of data.rows) {
        const cellText = (row.texts?.[col] || '').toLowerCase()
        if (verdictKeywords.some(keyword => cellText.includes(keyword.toLowerCase()))) matchCount++
      }
      if (matchCount > 0) {
        verdictIdx = col
        break
      }
    }
  }

  if (verdictIdx === -1 && data.rows?.length) {
    for (let col = 0; col < (data.rows[0].classNames?.length || 0); col++) {
      const className = (data.rows[0].classNames?.[col] || '').toLowerCase()
      if (className.includes('result') || className.includes('verdict') || className.includes('status') || className.includes('score')) {
        verdictIdx = col
        break
      }
    }
  }

  const typeLinkPattern = /problemSetProblemId[=\/](\d+)/
  const problemLinkPattern = /\/problem-sets\/(\d+)\/(?:problems|exam\/problems|exam-problems)\/(\d+)/
  const problemIdAttrPattern = /data-problem-id="(\d+)"/
  const setIdAttrPattern = /data-set-id="(\d+)"/

  const seen = new Set<string>()
  const results: SubmissionData[] = []

  for (let index = 0; index < data.rows.length; index++) {
    const cells = data.rows[index].texts || []
    const links = data.rows[index].links || []
    const allLinks: string[][] = data.rows[index].allLinks || []
    const htmls: string[] = data.rows[index].htmls || []
    const platformSubmissionId = (idIdx >= 0 && cells[idIdx]) ? `pta-${cells[idIdx]}` : extractStableId(links, 'pta')
    if (!platformSubmissionId) continue
    const language = languageIdx >= 0 ? cells[languageIdx] || '' : ''
    const rawVerdict = verdictIdx >= 0 ? cells[verdictIdx] || '' : ''
    const key = `${platformSubmissionId}-${rawVerdict}-${language}`
    if (seen.has(key)) continue
    seen.add(key)

    let ptaProblemId: string | undefined
    let extractedSetId: string | undefined
    let extractedProblemId: string | undefined
    const allCellLinks = (problemIdx >= 0 ? allLinks[problemIdx] || [] : links)
      .concat(...allLinks)

    for (const link of allCellLinks) {
      const typeMatch = link.match(typeLinkPattern)
      if (typeMatch) {
        extractedProblemId = typeMatch[1]
        const setMatch = link.match(/\/problem-sets\/(\d+)\//)
        if (setMatch) extractedSetId = setMatch[1]
        break
      }
    }

    if (!extractedProblemId) {
      for (const link of allCellLinks) {
        const match = link.match(problemLinkPattern)
        if (match) {
          extractedSetId = match[1]
          extractedProblemId = match[2]
          break
        }
      }
    }

    if (!extractedProblemId && problemIdx >= 0 && htmls[problemIdx]) {
      const attrMatch = htmls[problemIdx].match(problemIdAttrPattern)
      if (attrMatch) extractedProblemId = attrMatch[1]
      const setMatch = htmls[problemIdx].match(setIdAttrPattern)
      if (setMatch) extractedSetId = setMatch[1]
    }
    if (!extractedProblemId && problemIdx >= 0) {
      const numberMatch = cells[problemIdx].match(/(\d+)/)
      if (numberMatch) extractedProblemId = numberMatch[1]
    }

    if (extractedProblemId) {
      const setId = extractedSetId || urlSetId
      ptaProblemId = setId ? `${setId}-${extractedProblemId}` : extractedProblemId
    }

    results.push({
      platform: 'pta',
      platformSubmissionId,
      verdict: mapVerdict(rawVerdict),
      rawVerdict,
      language,
      runtimeMs: runtimeIdx >= 0 ? parseInt(cells[runtimeIdx]) || undefined : undefined,
      memoryKb: memoryIdx >= 0 ? parseInt(cells[memoryIdx]) || undefined : undefined,
      submittedAt: nowBeijing(),
      sourceUrl: links.find((link: string) => link) || '',
      rawJson: ptaProblemId ? JSON.stringify({ _ptaProblemId: ptaProblemId }) : undefined,
    } as any)
  }

  return results
}
