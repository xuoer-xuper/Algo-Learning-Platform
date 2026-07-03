export function createCodeforcesRealtimeHookScript(): string {
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
    const isContestStatusPage = () => /^\\/(?:contest|gym)\\/\\d+\\/status(?:\\/[A-Za-z]\\d*)?\\/?$/.test(pathname());
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
    const readCurrentHandle = () => {
      try {
        const links = Array.from(document.querySelectorAll('a[href*="/profile/"]'));
        for (const link of links) {
          const href = String(link.getAttribute('href') || link.href || '');
          const match = href.match(/\\/profile\\/([^/?#]+)/);
          const text = String(link.textContent || '').trim();
          if (match?.[1] && (!text || text === match[1])) return decodeURIComponent(match[1]);
        }
      } catch (_) {}
      return '';
    };
    const markSubmitIntent = (source) => {
      const problemMatch = pathname().match(/^\\/(?:contest|gym)\\/(\\d+)\\/problem\\/([A-Za-z]\\d*)/)
        || pathname().match(/^\\/problemset\\/problem\\/(\\d+)\\/([A-Za-z]\\d*)/);
      writeIntent({
        at: now(),
        source,
        pageUrl: location.href,
        contestId: problemMatch?.[1] || '',
        problemIndex: problemMatch?.[2] || '',
        handle: readCurrentHandle()
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
    const filterTablesForIntent = (tables) => {
      try {
        const intent = readIntent();
        const handle = String(intent.handle || '').trim();
        if (!handle) return tables;
        const loweredHandle = handle.toLowerCase();
        return tables.map((table) => {
          const whoIndex = (table.headers || []).findIndex((header) => /who|author|提交者|用户|handle/i.test(String(header || '')));
          if (whoIndex < 0) return table;
          const filteredRows = table.rows.filter((row) => String(row.texts?.[whoIndex] || '').trim().toLowerCase().includes(loweredHandle));
          return { ...table, rows: filteredRows };
        }).filter((table) => table.rows.length > 0);
      } catch (_) {
        return tables;
      }
    };
    const extractRowContext = (tables) => {
      try {
        for (const table of tables) {
          const row = table?.rows?.[0];
          if (!row?.texts?.length) continue;
          const headers = table.headers || [];
          const findIndex = (pattern) => headers.findIndex((header) => pattern.test(String(header || '')));
          const idIndex = findIndex(/^#|id|run/i);
          const whoIndex = findIndex(/who|author|提交者|用户|handle/i);
          const idText = idIndex >= 0 ? String(row.texts[idIndex] || '') : '';
          const fromText = idText.match(/\\d{4,}/)?.[0] || String(row.rowId || '').match(/\\d{4,}/)?.[0] || '';
          const fromLinks = (row.links || []).map(String).join(' ').match(/submission\\/(\\d{4,})|\\/(\\d{4,})(?=[/?#]|$)/);
          const submissionId = fromText || fromLinks?.[1] || fromLinks?.[2] || '';
          const handle = whoIndex >= 0 ? String(row.texts[whoIndex] || '').trim() : '';
          if (submissionId && handle) return { submissionId, handle };
        }
      } catch (_) {}
      return null;
    };
    const apiCache = window.__ALGO_CF_API_CACHE__ || {};
    window.__ALGO_CF_API_CACHE__ = apiCache;
    const enrichWithApi = async (tables) => {
      const context = extractRowContext(tables);
      if (!context) return { _source: 'codeforces-realtime-scan', tables };
      const key = context.handle + ':' + context.submissionId;
      if (apiCache[key]) return { _source: 'codeforces-realtime-scan', tables, apiSubmission: apiCache[key] };
      try {
        const url = '/api/user.status?handle=' + encodeURIComponent(context.handle) + '&from=1&count=10';
        const response = await fetch(url, { credentials: 'same-origin' });
        if (!response.ok) return { _source: 'codeforces-realtime-scan', tables };
        const json = await response.json();
        const submission = Array.isArray(json?.result)
          ? json.result.find((item) => String(item?.id || '') === String(context.submissionId))
          : null;
        if (submission) {
          apiCache[key] = submission;
          return { _source: 'codeforces-realtime-scan', tables, apiSubmission: submission };
        }
      } catch (_) {}
      return { _source: 'codeforces-realtime-scan', tables };
    };

    const shouldReport = () => isSingleSubmissionPage() || ((isMySubmissionPage() || isContestStatusPage()) && hasRecentSubmitIntent());
    const pendingPattern = /TESTING|In\\s+queue|Queued|Pending|Running|Judging|Compiling|等待|排队|队列|判题|测试中|评测中/i;
    const latestRowText = (tables) => {
      try {
        for (const table of tables) {
          const row = table?.rows?.[0];
          if (row?.texts?.length) return row.texts.join(' ');
        }
      } catch (_) {}
      return '';
    };
    const hasPendingLatestRow = (tables) => pendingPattern.test(latestRowText(tables));
    // Codeforces status pages often keep stale "Testing" text until a full reload.
    // The retry is bounded and submit-intent gated so browsing status pages is not recorded.
    const scheduleReloadForPending = () => {
      try {
        const key = '__ALGO_CF_PENDING_RELOAD__:' + pathname();
        const current = JSON.parse(sessionStorage.getItem(key) || 'null') || {};
        if (typeof current.count === 'number' && current.count >= 8) return;
        if (typeof current.at === 'number' && now() - current.at < 3500) return;
        sessionStorage.setItem(key, JSON.stringify({ at: now(), count: (current.count || 0) + 1 }));
        setTimeout(() => {
          try {
            if (shouldReport()) location.reload();
          } catch (_) {}
        }, 2600);
      } catch (_) {}
    };

    const report = async () => {
      try {
        if (!shouldReport()) return;
        const tables = filterTablesForIntent(extractTables());
        if (!tables.length) return;
        if (hasPendingLatestRow(tables)) {
          scheduleReloadForPending();
          return;
        }
        const payload = {
          adapterId: ADAPTER_ID,
          pageUrl: location.href,
          requestUrl: location.href,
          response: await enrichWithApi(tables),
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
