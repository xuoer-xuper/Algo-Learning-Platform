export function createVjudgeStatusHookScript(): string {
  return `(() => {
    const CHANNEL = '__algo_submission_v1';
    const ADAPTER_ID = 'vjudge';
    const INTENT_KEY = '__ALGO_SUBMIT_INTENT_vjudge';
    const DETAIL_SCAN_DELAYS = [0, 400, 1000, 2200, 5000, 9000, 15000];
    if (window.__ALGO_VJUDGE_STATUS_HOOK_INSTALLED__) return;
    window.__ALGO_VJUDGE_STATUS_HOOK_INSTALLED__ = true;
    let lastDetailResultKey = '';
    let detailObserverInstalled = false;

    const now = () => Date.now();
    const getTopPageUrl = () => {
      try {
        const value = window.__ALGO_TOP_PAGE_URL;
        if (typeof value === 'string' && value.trim()) return value;
      } catch (_) {}
      return location.href;
    };
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
    const detectCurrentUser = () => {
      try {
        const selectors = [
          'a[href*="/user/"]',
          'a[href*="userName="]',
          '[class*="user"]',
          '[class*="User"]',
          '[id*="user"]',
          '[id*="User"]'
        ];
        for (const element of Array.from(document.querySelectorAll(selectors.join(',')))) {
          const text = String(element.textContent || element.getAttribute?.('title') || element.getAttribute?.('aria-label') || '').replace(/\\s+/g, ' ').trim();
          if (!text || text.length > 64) continue;
          if (/login|logout|register|sign\\s*in|sign\\s*out|登录|注册|退出/i.test(text)) continue;
          return text;
        }
      } catch (_) {}
      return '';
    };
    const markSubmitIntent = (source) => {
      const intent = readIntent();
      writeIntent({
        ...intent,
        at: now(),
        source,
        pageUrl: getTopPageUrl(),
        user: intent.user || detectCurrentUser()
      });
      scheduleSolutionDetailScans();
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
    const parseJsonMaybe = (value) => {
      if (!value) return null;
      if (typeof value === 'object') return value;
      if (typeof value !== 'string') return null;
      try {
        return JSON.parse(value);
      } catch (_) {
        return null;
      }
    };
    const extractSolutionId = (value) => {
      try {
        if (typeof value === 'string' || typeof value === 'number') {
          const id = String(value).match(/\\d{4,}/)?.[0];
          if (id) return id;
        }
        const seen = new Set();
        const queue = [value];
        while (queue.length) {
          const current = queue.shift();
          if (!current || typeof current !== 'object' || seen.has(current)) continue;
          seen.add(current);
          for (const [key, item] of Object.entries(current)) {
            if (/^(?:solution|submission|run)?id$|solutionId|submissionId|runId/i.test(key)) {
              const id = String(item || '').match(/\\d{4,}/)?.[0];
              if (id) return id;
            }
            if (/^(?:data|result|value)$/i.test(key) && (typeof item === 'string' || typeof item === 'number')) {
              const id = String(item || '').match(/\\d{4,}/)?.[0];
              if (id) return id;
            }
            if (item && typeof item === 'object') queue.push(item);
          }
        }
      } catch (_) {}
      return '';
    };
    const rememberSubmitResponse = (body) => {
      try {
        const parsed = parseJsonMaybe(body);
        const solutionId = extractSolutionId(parsed);
        if (!solutionId) return;
        const intent = readIntent();
        if (!hasRecentSubmitIntent()) return;
        writeIntent({
          ...intent,
          solutionId
        });
        scheduleSolutionDetailScans();
      } catch (_) {}
    };
    const idFromUrl = (requestUrl) => {
      const text = String(requestUrl || '');
      return text.match(/(?:solution|submission|run)(?:\\/|=)(\\d{4,})/i)?.[1]
        || text.match(/[?&](?:id|solutionId|submissionId|runId)=(\\d{4,})/i)?.[1]
        || '';
    };
    const valueOf = (record, keys) => {
      if (!record || typeof record !== 'object') return '';
      for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return stripHtml(value);
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      }
      return '';
    };
    const solutionIdOf = (record) => {
      const id = valueOf(record, ['id', 'solutionId', 'submissionId', 'runId', 'solution_id', 'submission_id']);
      return /^\\d{4,}$/.test(id) ? id : '';
    };
    const verdictTextOf = (record) => valueOf(record, [
      'verdict',
      'result',
      'status',
      'statusText',
      'statusName',
      'statusDisplay',
      'displayStatus',
      'judgeStatus',
      'judgeResult',
      'ojStatus',
      'message'
    ]);
    const hasFinalVerdict = (record) => {
      const text = verdictTextOf(record);
      if (!text) return false;
      if (/Waiting|Queue|Pending|Judging|Running|Testing|Compiling|等待|排队|评测中|判题中/i.test(text)) return false;
      return /Accepted|Wrong\\s+Answer|Time\\s+Limit|Memory\\s+Limit|Runtime\\s+Error|Compile\\s+Error|Compilation\\s+Error|Presentation\\s+Error|Output\\s+Limit|答案正确|答案错误|时间超限|内存超限|运行错误|编译错误|格式错误|输出超限|\\bAC\\b|\\bWA\\b|\\bTLE\\b|\\bMLE\\b|\\bRE\\b|\\bCE\\b|\\bPE\\b|\\bOLE\\b/i.test(text);
    };
    const solutionProblemText = (record) => {
      if (!record || typeof record !== 'object') return '';
      const direct = valueOf(record, ['problem', 'problemId', 'problemNum', 'probNum', 'num']);
      const oj = valueOf(record, ['oj', 'OJ', 'originOJ', 'sourceOJ', 'sourcePlatform']);
      const probNum = valueOf(record, ['probNum', 'problemNum', 'num', 'sourceProblemId']);
      return [direct, oj && probNum ? oj + '-' + probNum : ''].filter(Boolean).join(' ');
    };
    const solutionMatchesCurrentProblem = (record) => {
      const problem = currentProblemPattern();
      if (!problem || !record || typeof record !== 'object') return false;
      const text = solutionProblemText(record);
      if (!text) return false;
      if (problem.type === 'standalone') {
        const id = String(problem.id || '').replace(/\\s+/g, '').toLowerCase();
        return text.replace(/\\s+/g, '').toLowerCase().includes(id);
      }
      const letter = String(problem.letter || '');
      if (!letter) return false;
      const escaped = letter.replace(/[^A-Za-z0-9]/g, '\\\\$&');
      return new RegExp('(^|[^A-Za-z0-9])' + escaped + '($|[^A-Za-z0-9])', 'i').test(text)
        || String(valueOf(record, ['num', 'probNum', 'problemNum', 'sourceProblemId'])).toLowerCase().endsWith(letter.toLowerCase());
    };
    const isFinalSolutionRecord = (record) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
      if (!hasFinalVerdict(record)) return false;
      return Boolean(
        solutionIdOf(record)
        || solutionProblemText(record)
        || valueOf(record, ['language', 'languageName', 'lang', 'langName'])
        || valueOf(record, ['time', 'runtime', 'runTime', 'memory'])
      );
    };
    const findFinalSolutionRecord = (json, requestUrl) => {
      try {
        const intent = readIntent();
        const expectedId = String(intent.solutionId || idFromUrl(requestUrl) || '').trim();
        const queue = [json];
        const seen = new Set();
        while (queue.length) {
          const current = queue.shift();
          if (!current || typeof current !== 'object' || seen.has(current)) continue;
          seen.add(current);
          if (isFinalSolutionRecord(current)) {
            const currentId = solutionIdOf(current);
            if (expectedId && currentId && currentId !== expectedId) {
              // keep searching: this may be a public row from a batched response
            } else if (expectedId || currentId || solutionMatchesCurrentProblem(current)) {
              return {
                ...current,
                _solutionId: currentId || expectedId
              };
            }
          }
          if (Array.isArray(current)) {
            current.slice(0, 50).forEach((item) => {
              if (item && typeof item === 'object') queue.push(item);
            });
            continue;
          }
          for (const key of ['data', 'result', 'solution', 'submission', 'record', 'status', 'detail', 'run']) {
            const next = current[key];
            if (next && typeof next === 'object') queue.push(next);
          }
        }
      } catch (_) {}
      return null;
    };

    const report = (requestUrl, response) => {
      try {
        const intent = readIntent();
        const payload = {
          adapterId: ADAPTER_ID,
          pageUrl: typeof intent.pageUrl === 'string' && intent.pageUrl ? intent.pageUrl : getTopPageUrl(),
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

    const stripHtml = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
    const textOf = (element) => {
      try {
        return String(element?.innerText || element?.textContent || '').replace(/\\s+/g, ' ').trim();
      } catch (_) {
        return '';
      }
    };
    const detailLabels = [
      '评测结果',
      '耗时',
      '内存消耗',
      '代码长度',
      '语言',
      '提交时间',
      '公开',
      '分享文本',
      '远程提交ID',
      '远程账号',
      'Result',
      'Status',
      'Runtime',
      'Time',
      'Memory',
      'Language',
      'Submit Time',
      'Submitted',
      'Remote Submit ID',
      'Remote Account'
    ];
    const escapeRegex = (value) => String(value).replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    const readDetailLabel = (text, labels) => {
      try {
        const labelPattern = labels.slice().sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
        const nextPattern = detailLabels.slice().sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
        const match = String(text || '').match(new RegExp('(?:' + labelPattern + ')\\\\s*[:：]?\\\\s*([\\\\s\\\\S]*?)(?=\\\\s*(?:' + nextPattern + ')\\\\s*[:：]?|$)', 'i'));
        return match?.[1]?.replace(/\\s+/g, ' ').trim() || '';
      } catch (_) {
        return '';
      }
    };
    const linksOf = (element) => {
      try {
        return Array.from(element?.querySelectorAll?.('a') || [])
          .map((anchor) => String(anchor.href || anchor.getAttribute?.('href') || '').trim())
          .filter(Boolean)
          .slice(0, 20);
      } catch (_) {
        return [];
      }
    };
    const solutionIdFromDetail = (text, links) => {
      const locationId = String(location.pathname || '').match(/\\/(?:solution|problem\\/view\\/submission)\\/(\\d{4,})\\/?$/i)?.[1];
      if (locationId) return locationId;
      for (const link of links) {
        const id = String(link || '').match(/\\/(?:solution|problem\\/view\\/submission)\\/(\\d{4,})\\b/i)?.[1];
        if (id) return id;
      }
      return String(text || '').match(/#\\s*(\\d{4,})\\b/)?.[1]
        || String(text || '').match(/\\bID\\s*[:#]?\\s*(\\d{4,})\\b/i)?.[1]
        || '';
    };
    const expectedSolutionId = () => {
      const intent = readIntent();
      const expected = String(intent.solutionId || '').trim();
      return /^\\d{4,}$/.test(expected) ? expected : '';
    };
    const problemFromDetail = (text, links) => {
      for (const link of links) {
        const problem = String(link || '').match(/\\/problem\\/([A-Za-z][A-Za-z0-9_+.-]*-[^/?#\\s]+)/)?.[1];
        if (problem) return problem;
      }
      return String(text || '').match(/\\b([A-Za-z][A-Za-z0-9_+.-]*-\\d+[A-Za-z0-9_+.-]*)\\b/)?.[1] || '';
    };
    const isSolutionDetailPage = () => /^\\/(?:solution|problem\\/view\\/submission)\\/\\d+\\/?$/i.test(String(location.pathname || ''));
    const canReadSolutionDetail = () => hasRecentSubmitIntent() || isSolutionDetailPage();
    const hasFinalDetailVerdict = (verdictText) => {
      const text = String(verdictText || '');
      if (!text || /Waiting|Queue|Pending|Judging|Running|Testing|Compiling|等待|排队|评测中|判题中/i.test(text)) return false;
      return /Accepted|Wrong\\s+Answer|Time\\s+Limit|Memory\\s+Limit|Runtime\\s+Error|Compile\\s+Error|Compilation\\s+Error|Presentation\\s+Error|Output\\s+Limit|答案正确|答案错误|时间超限|内存超限|运行错误|编译错误|格式错误|输出超限|\\bAC\\b|\\bWA\\b|\\bTLE\\b|\\bMLE\\b|\\bRE\\b|\\bCE\\b|\\bPE\\b|\\bOLE\\b/i.test(text);
    };
    const isLikelySolutionDetail = (element, text, links) => {
      if (!text || text.length > 2600) return false;
      if ((element === document.body || element === document.documentElement) && !isSolutionDetailPage()) return false;
      if (!/评测结果|远程提交ID|耗时|内存消耗|提交时间|Result|Runtime|Memory|Language|Submitted/i.test(text)) return false;
      const labelMatches = text.match(/评测结果|远程提交ID|耗时|内存消耗|提交时间|Result|Runtime|Memory|Language|Submitted/gi) || [];
      if (labelMatches.length < 2) return false;
      if (!readDetailLabel(text, ['评测结果', 'Result', 'Status'])) return false;
      // This is a VJudge solution-detail reader, not a general DOM verdict
      // observer. The visible solution id/link is required so public status rows
      // such as "WA Pascal 2026-..." cannot become realtime submissions.
      const detailId = solutionIdFromDetail(text, links);
      if (!detailId) return false;
      const expectedId = expectedSolutionId();
      if (expectedId && detailId !== expectedId) return false;
      const marker = String((element?.id || '') + ' ' + (element?.className || '') + ' ' + (element?.getAttribute?.('role') || '')).toLowerCase();
      return /solution|submission|modal|dialog|result|status|detail|judge/.test(marker)
        || /#\\s*\\d{4,}\\b/.test(text)
        || linksOf(element).some((link) => /\\/solution\\/\\d{4,}\\b/i.test(link));
    };
    const reportSolutionDetail = (element) => {
      try {
        if (!canReadSolutionDetail()) return;
        const text = textOf(element);
        const links = linksOf(element);
        if (!isLikelySolutionDetail(element, text, links)) return;
        const id = solutionIdFromDetail(text, links);
        if (!id) return;
        const verdictText = readDetailLabel(text, ['评测结果', 'Result', 'Status']);
        if (!hasFinalDetailVerdict(verdictText)) return;
        const runtime = readDetailLabel(text, ['耗时', 'Runtime', 'Run Time']);
        const memory = readDetailLabel(text, ['内存消耗', 'Memory']);
        const language = readDetailLabel(text, ['语言', 'Language']);
        const submittedAt = readDetailLabel(text, ['提交时间', 'Submit Time', 'Submitted']);
        const problem = problemFromDetail(text, links);
        const key = [id, verdictText, runtime, memory, language, submittedAt].join('|');
        if (lastDetailResultKey === key) return;
        lastDetailResultKey = key;
        report(location.href, {
          _source: 'vjudge-solution-detail-dom',
          solutionId: id,
          result: {
            id,
            verdict: verdictText,
            runtime,
            memory,
            language,
            submittedAt,
            problem,
            _domLinks: links.slice(0, 10),
            _domText: text.slice(0, 1200)
          }
        });
      } catch (_) {}
    };
    function scanSolutionDetails() {
      try {
        if (!canReadSolutionDetail() || !document.body) return;
        const candidates = [];
        if (isSolutionDetailPage()) candidates.push(document.body);
        document.querySelectorAll?.('[role="dialog"],[class*="modal"],[class*="dialog"],[class*="modal-body"],[class*="modal-content"],[class*="solution"],[id*="solution"],[class*="submission"],[id*="submission"],[class*="result"],[id*="result"],[class*="status"],[id*="status"],[class*="judge"],[id*="judge"],[class*="detail"],[id*="detail"]').forEach((item) => candidates.push(item));
        for (const candidate of Array.from(new Set(candidates))) {
          reportSolutionDetail(candidate);
        }
      } catch (_) {}
    }
    function scheduleSolutionDetailScans() {
      DETAIL_SCAN_DELAYS.forEach((delay) => setTimeout(scanSolutionDetails, delay));
    }
    const installSolutionDetailObserver = () => {
      try {
        if (detailObserverInstalled || typeof MutationObserver === 'undefined' || !document.body) return false;
        detailObserverInstalled = true;
        const observer = new MutationObserver((mutations) => {
          if (!canReadSolutionDetail()) return;
          scanSolutionDetails();
          for (const mutation of mutations) {
            mutation.addedNodes && mutation.addedNodes.forEach((node) => {
              const element = node && node.nodeType === 1 ? node : node?.parentElement;
              if (element) reportSolutionDetail(element);
            });
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        return true;
      } catch (_) {
        return false;
      }
    };
    const currentProblemPattern = () => {
      const intent = readIntent();
      const href = typeof intent.pageUrl === 'string' && intent.pageUrl ? intent.pageUrl : getTopPageUrl();
      let parsed = null;
      try {
        parsed = new URL(href, location.href);
      } catch (_) {}
      const path = String(parsed?.pathname || location.pathname || '');
      const standalone = path.match(/^\\/problem\\/([^/\\s]+)-(.+)/);
      if (standalone) return { type: 'standalone', id: standalone[1] + '-' + standalone[2] };
      const contest = path.match(/^\\/contest\\/(\\d+)/);
      const letter = String(parsed?.hash || location.hash || '').match(/#problem\\/([A-Za-z0-9]+)/)?.[1];
      if (contest && letter) return { type: 'contest', letter };
      return null;
    };
    const rowMatchesCurrentProblem = (row) => {
      const problem = currentProblemPattern();
      if (!problem || !Array.isArray(row)) return false;
      const rawText = row.map((cell) => String(cell || '')).join(' ');
      const text = row.map(stripHtml).join(' ');
      if (problem.type === 'standalone') {
        const id = String(problem.id || '').replace(/\\s+/g, '');
        return rawText.replace(/\\s+/g, '').includes(id) || text.replace(/\\s+/g, '').includes(id);
      }
      const letter = String(problem.letter || '');
      const escaped = letter;
      return new RegExp('(^|[^A-Za-z0-9])' + escaped + '($|[^A-Za-z0-9])', 'i').test(text)
        || new RegExp('#problem/' + escaped + '($|[^A-Za-z0-9])', 'i').test(rawText)
        || new RegExp('[A-Za-z0-9_+.-]*[-\\\\s][A-Za-z0-9_+.-]*' + escaped + '($|[^A-Za-z0-9])', 'i').test(text);
    };
    const rowSolutionId = (row) => {
      if (!Array.isArray(row)) return '';
      for (const cell of row) {
        const id = stripHtml(cell).match(/^\\d{4,}$/)?.[0];
        if (id) return id;
      }
      return '';
    };
    const rowMatchesCurrentUser = (row, user) => {
      const name = String(user || '').replace(/\\s+/g, ' ').trim();
      if (!name || !Array.isArray(row)) return false;
      return row.map(stripHtml).some((cell) => cell === name);
    };
    const rowMatchesSubmitIntent = (row) => {
      const intent = readIntent();
      const expectedId = String(intent.solutionId || '').trim();
      if (expectedId) return rowSolutionId(row) === expectedId;
      return rowMatchesCurrentProblem(row) && rowMatchesCurrentUser(row, intent.user);
    };
    const isFinalLatestStatusRow = (row) => {
      try {
        if (!Array.isArray(row)) return false;
        const text = row.map(stripHtml).join(' ');
        if (/Waiting|Queue|Pending|Judging|Running|Testing|Compiling|等待|排队|评测中|判题中/i.test(text)) return false;
        return /Accepted|Wrong\\s+Answer|Time\\s+Limit|Memory\\s+Limit|Runtime\\s+Error|Compile\\s+Error|Compilation\\s+Error|Presentation\\s+Error|Output\\s+Limit|答案正确|答案错误|时间超限|内存超限|运行错误|编译错误|格式错误|输出超限/i.test(text);
      } catch (_) {
        return false;
      }
    };
    const pickLatestAssociatedStatusRow = (json) => {
      try {
        const rows = Array.isArray(json?.data) ? json.data : [];
        for (const row of rows) {
          if (!Array.isArray(row)) continue;
          if (!rowMatchesSubmitIntent(row)) continue;
          return isFinalLatestStatusRow(row) ? row : null;
        }
      } catch (_) {}
      return null;
    };

    const pickStatusReportPayload = (requestUrl, json) => {
      if (!/\\/status\\/data\\/?/.test(String(requestUrl || ''))) return null;
      if (!Array.isArray(json?.data) || !hasRecentSubmitIntent()) return null;
      const row = pickLatestAssociatedStatusRow(json);
      if (!row) return null;
      return {
        ...json,
        _source: 'vjudge-status-data',
        data: [row]
      };
    };
    const pickSolutionReportPayload = (requestUrl, json) => {
      if (!hasRecentSubmitIntent()) return null;
      const result = findFinalSolutionRecord(json, requestUrl);
      if (!result) return null;
      return {
        _source: 'vjudge-solution-data',
        solutionId: result._solutionId || '',
        result
      };
    };
    const pickReportPayload = (requestUrl, json) => pickStatusReportPayload(requestUrl, json)
      || pickSolutionReportPayload(requestUrl, json);

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
        const target = event.target && event.target.closest ? event.target.closest('button,input,a,[role="button"],[class*="button"],[class*="Button"],[class*="btn"],[class*="Btn"],[class*="submit"],[class*="Submit"]') : null;
        const text = String(target?.textContent || target?.value || target?.getAttribute?.('aria-label') || target?.getAttribute?.('title') || '').trim();
        if (isOfficialSubmitText(text)) markSubmitIntent('click');
      }, true);
      document.addEventListener('submit', () => markSubmitIntent('form'), true);
    } catch (_) {}

    [0, 400, 1200, 3000].forEach((delay) => setTimeout(installSolutionDetailObserver, delay));
    if (canReadSolutionDetail()) scheduleSolutionDetailScans();

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' ? input : input && input.url;
        const method = init?.method || (typeof input === 'object' && input ? input.method : '');
        const isSubmitRequest = maybeSubmitUrl(requestUrl, method);
        if (isSubmitRequest) markSubmitIntent('fetch');
        const response = await originalFetch.apply(this, arguments);
        try {
          if (requestUrl) {
            response.clone().json().then((json) => {
              if (isSubmitRequest) rememberSubmitResponse(json);
              const statusPayload = pickReportPayload(requestUrl, json);
              if (statusPayload) report(requestUrl, statusPayload);
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
        const isSubmitRequest = maybeSubmitUrl(this.__algoRequestUrl, this.__algoRequestMethod);
        if (isSubmitRequest) markSubmitIntent('xhr');
        this.addEventListener('load', function() {
          try {
            const requestUrl = this.__algoRequestUrl;
            if (!requestUrl) return;
            const json = JSON.parse(this.responseText);
            if (isSubmitRequest) rememberSubmitResponse(json);
            const statusPayload = pickReportPayload(requestUrl, json);
            if (statusPayload) report(requestUrl, statusPayload);
          } catch (_) {}
        });
        return originalSend.apply(this, arguments);
      };
    }
  })();`
}
