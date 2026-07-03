export function createNowcoderJudgeStatusHookScript(): string {
  return `(() => {
    const CHANNEL = '__algo_submission_v1';
    const ADAPTER_ID = 'nowcoder';
    const INTENT_KEY = '__ALGO_SUBMIT_INTENT_nowcoder';
    const INTENT_MESSAGE_CHANNEL = CHANNEL + ':submit-intent';
    const INSTALLED_KEY = '__ALGO_NOWCODER_NETWORK_HOOK_INSTALLED__';
    if (window[INSTALLED_KEY]) return;
    window[INSTALLED_KEY] = true;

    const now = () => Date.now();
    const parseUrl = (value) => {
      try {
        return new URL(String(value || ''), location.href);
      } catch (_) {
        return null;
      }
    };
    const getTopPageUrl = () => {
      try {
        const value = window.__ALGO_TOP_PAGE_URL;
        if (typeof value === 'string' && value.trim()) return value;
      } catch (_) {}
      return location.href;
    };
    const isProblemPage = (urlValue = getTopPageUrl()) => {
      const parsed = parseUrl(urlValue);
      if (!parsed) return false;
      const host = String(parsed.hostname || '');
      const path = String(parsed.pathname || '');
      if (/^(?:www\\.)?nowcoder\\.com$/.test(host)) {
        return /^\\/(?:practice|questionTerminal)\\/[^/]+\\/?$/i.test(path);
      }
      return host === 'ac.nowcoder.com'
        && (/^\\/acm\\/problem\\/\\d+\\/?$/.test(path)
          || /^\\/acm\\/contest\\/\\d+\\/(?!status|rank|ranking|submission|submissions|view-submission)([^/]+)\\/?$/i.test(path));
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
    const clearIntent = () => {
      try {
        sessionStorage.removeItem(INTENT_KEY);
      } catch (_) {}
      state.lastResultKey = '';
    };
    const state = window[INSTALLED_KEY + '_STATE'] || { lastResultKey: '' };
    window[INSTALLED_KEY + '_STATE'] = state;

    const textOf = (node) => {
      try {
        if (!node) return '';
        const element = node.nodeType === 1 ? node : node.parentElement;
        if (!element) return '';
        return String(element.textContent || element.value || element.getAttribute?.('aria-label') || element.getAttribute?.('title') || '').replace(/\\s+/g, ' ').trim();
      } catch (_) {
        return '';
      }
    };
    const pickLanguage = (value) => {
      const text = String(value || '').replace(/\\s+/g, ' ').trim();
      if (!text || text.length > 120) return '';
      const match = text.match(/(?:GNU\\s+)?C\\+\\+\\s*\\d*(?:\\s*\\([^)]+\\))?|(?:GNU\\s+)?C(?:\\s*\\([^)]+\\))?|JavaScript|TypeScript|Python\\s*\\d*|PyPy\\s*\\d*|Java|Go|Rust|Pascal|GCC|Clang/i);
      return match ? match[0].replace(/\\s+/g, ' ').trim() : '';
    };
    const detectPageLanguage = () => {
      try {
        for (const option of Array.from(document.querySelectorAll('select option:checked'))) {
          const language = pickLanguage(option.textContent || option.value);
          if (language) return language;
        }
        const selectors = [
          '[name*="language" i]',
          '[id*="language" i]',
          '[class*="language" i]',
          '[class*="lang" i]',
          '[aria-label*="language" i]',
          '[aria-label*="语言" i]',
          '.active',
          '[aria-selected="true"]'
        ];
        for (const element of Array.from(document.querySelectorAll(selectors.join(',')))) {
          const language = pickLanguage(element.value || element.getAttribute?.('title') || element.getAttribute?.('aria-label') || textOf(element));
          if (language) return language;
        }
      } catch (_) {}
      return '';
    };
    const shareSubmitIntent = (intent) => {
      try {
        const message = { channel: INTENT_MESSAGE_CHANNEL, adapterId: ADAPTER_ID, intent };
        if (window.parent && window.parent !== window) window.parent.postMessage(message, '*');
        if (window.top && window.top !== window && window.top !== window.parent) window.top.postMessage(message, '*');
      } catch (_) {}
    };
    const acceptSharedSubmitIntent = (intent) => {
      try {
        if (!intent || typeof intent !== 'object') return false;
        if (typeof intent.id !== 'string' || !intent.id) return false;
        if (typeof intent.pageUrl !== 'string' || !isProblemPage(intent.pageUrl)) return false;
        writeIntent({
          id: intent.id,
          at: now(),
          source: typeof intent.source === 'string' ? intent.source : 'frame',
          pageUrl: intent.pageUrl,
          language: typeof intent.language === 'string' ? intent.language : ''
        });
        return true;
      } catch (_) {
        return false;
      }
    };
    // Nowcoder is network-result driven: DOM result panels are not trusted because
    // self-test and formal-submit panels share nearly identical text.
    const markSubmitIntent = (source) => {
      const pageUrl = getTopPageUrl();
      if (!isProblemPage(pageUrl)) return null;
      const current = readIntent();
      const id = current.id && now() - current.at < 1000 ? current.id : String(now().toString(36) + Math.random().toString(36).slice(2, 8));
      const intent = {
        id,
        at: now(),
        source,
        pageUrl,
        language: detectPageLanguage()
      };
      state.lastResultKey = '';
      writeIntent(intent);
      shareSubmitIntent(intent);
      return intent;
    };
    const hasRecentSubmitIntent = () => {
      const intent = readIntent();
      return typeof intent.at === 'number'
        && now() - intent.at < 5 * 60 * 1000
        && typeof intent.id === 'string'
        && intent.id
        && typeof intent.pageUrl === 'string'
        && isProblemPage(intent.pageUrl);
    };
    const bodyText = (body) => {
      try {
        if (!body) return '';
        if (typeof body === 'string') return body;
        if (body instanceof URLSearchParams) return body.toString();
        if (body instanceof FormData) {
          return Array.from(body.entries()).map(([key, value]) => key + '=' + String(value)).join('&');
        }
        if (typeof body === 'object') return JSON.stringify(body);
      } catch (_) {}
      return '';
    };
    const selfTestPattern = /(?:^|[/?&#=_-])(?:self|custom|sample|testcase|debug|trial|run|compile|execute)(?:$|[/?&#=_-])|isSelfTest|selfTest|customTest|sampleTest|自测|调试|样例|测试输入|自测输入|自定义输入/i;
    const viewHistoryPattern = /view|history|record-list|submission-list|view-submission|submissionid|detail|status-list|我的提交|提交记录/i;
    const isSelfTestRequest = (requestUrl, body) => selfTestPattern.test(String(requestUrl || '') + ' ' + bodyText(body));
    const isOfficialSubmitRequest = (requestUrl, method, body) => {
      const verb = String(method || 'GET').toUpperCase();
      if (verb !== 'POST' && verb !== 'PUT' && verb !== 'PATCH') return false;
      const url = String(requestUrl || '').toLowerCase();
      if (viewHistoryPattern.test(url)) return false;
      if (isSelfTestRequest(requestUrl, body)) {
        clearIntent();
        return false;
      }
      return /(?:^|[/?&#=_-])(?:submit|submission|commit|answer|coding|judge)(?:$|[/?&#=_-])|\\/api\\/.{0,120}(?:submit|submission|commit|answer|coding|judge)/i.test(url);
    };
    const isBlockedSubmitText = (text) => /查看|上次|记录|详情|历史|列表|状态|结果|我的提交|提交记录|View|Last|History|Record|Detail|Status|Result|Submission\\s+List/i.test(String(text || ''));
    const isSelfTestText = (text) => /自测|调试|运行|run|test|样例|测试/i.test(String(text || '')) && !/提交|submit/i.test(String(text || ''));
    const isOfficialSubmitText = (text) => {
      const value = String(text || '').replace(/\\s+/g, ' ').trim();
      if (!/提交|submit/i.test(value)) return false;
      if (isBlockedSubmitText(value)) return false;
      if (/提交/.test(value) && value.length <= 60) return true;
      if (/^Submit\\b/i.test(value) && value.length <= 50) return true;
      return /^Save\\s+and\\s+Submit$/i.test(value);
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
    const isSelfTestJudgeData = (data) => {
      if (!data || typeof data !== 'object') return true;
      if (data.isSelfTest === true || data.isSelfTest === 'true' || data.submitType === 2) return true;
      const text = [
        data.type,
        data.submitType,
        data.scene,
        data.source,
        data.judgeReplyDesc,
        data.desc,
        data.memo
      ].filter(Boolean).join(' ');
      return /自测|调试|样例|custom\\s*test|sample\\s*test|self\\s*test/i.test(text);
    };
    const pendingPattern = /等待评测|正在评测|评测中|排队中|运行中|Pending|Judging|Running|Testing|Compiling/i;
    const finalPattern = /答案正确|Accepted|恭喜.*通过|已通过|(?:全部|所有)测试用例(?:均)?通过|通过(?:了)?(?:本题|全部|所有)(?:测试用例)?|答案错误|Wrong\\s+Answer|未通过|时间超限|运行超时|Time\\s+Limit|内存超限|Memory\\s+Limit|运行错误|Runtime\\s+Error|编译错误|Compile\\s+Error|Compilation\\s+Error|格式错误|Presentation\\s+Error|输出超限|Output\\s+Limit/i;
    const judgeSignal = (data) => {
      if (!data || typeof data !== 'object') return false;
      return 'status' in data
        || 'statusCode' in data
        || 'judgeReplyDesc' in data
        || 'enJudgeReplyDesc' in data
        || 'memo' in data
        || 'enMemo' in data
        || 'timeConsumption' in data
        || 'memoryConsumption' in data
        || 'submissionId' in data;
    };
    const judgeText = (data) => [
      data?.judgeReplyDesc,
      data?.enJudgeReplyDesc,
      data?.desc,
      data?.enDesc,
      data?.memo,
      data?.enMemo,
      data?.result,
      data?.statusText
    ].filter(Boolean).join(' ');
    const isFinalJudgeData = (data) => {
      if (!data || typeof data !== 'object') return false;
      if (!judgeSignal(data) || isSelfTestJudgeData(data)) return false;
      const status = Number(data.status ?? data.statusCode);
      const text = judgeText(data);
      const hasJudgeDetail = Boolean(text)
        || 'timeConsumption' in data
        || 'memoryConsumption' in data
        || 'submissionId' in data
        || 'submission_id' in data
        || 'languageName' in data
        || 'language' in data
        || 'id' in data;
      if (!hasJudgeDetail) return false;
      if (Number.isFinite(status) && status < 3) return false;
      if (text && pendingPattern.test(text)) return false;
      if (Number.isFinite(status) && status >= 3) return true;
      return Boolean(text && finalPattern.test(text));
    };
    const findFinalJudgeData = (value) => {
      try {
        const queue = [value];
        const seen = new Set();
        while (queue.length) {
          const current = queue.shift();
          if (!current || typeof current !== 'object' || seen.has(current)) continue;
          seen.add(current);
          if (isFinalJudgeData(current)) return current;
          if (Array.isArray(current)) {
            current.slice(0, 20).forEach((item) => {
              if (item && typeof item === 'object') queue.push(item);
            });
            continue;
          }
          for (const key of ['data', 'result', 'judgeResult', 'judgeInfo', 'submission', 'submissionResult', 'record']) {
            const next = current[key];
            if (next && typeof next === 'object') queue.push(next);
          }
        }
      } catch (_) {}
      return null;
    };
    const reportNetworkResult = (requestUrl, result) => {
      try {
        if (!hasRecentSubmitIntent()) return;
        const intent = readIntent();
        const data = findFinalJudgeData(result);
        if (!data) return;
        const key = intent.id + ':network:' + String(data.submissionId || data.id || '') + ':' + String(data.status || data.statusCode || '') + ':' + judgeText(data);
        if (state.lastResultKey === key) return;
        state.lastResultKey = key;
        const payload = {
          adapterId: ADAPTER_ID,
          pageUrl: intent.pageUrl,
          requestUrl: String(requestUrl || location.href),
          response: {
            _source: 'nowcoder-judge-status',
            submitId: intent.id,
            result: data,
            language: intent.language || detectPageLanguage()
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
    const maybeReportNetworkResult = (requestUrl, body) => {
      try {
        const parsed = parseJsonMaybe(body);
        if (!parsed) return;
        reportNetworkResult(requestUrl, parsed);
      } catch (_) {}
    };

    try {
      window.addEventListener('message', (event) => {
        const data = event && event.data;
        if (!data || typeof data !== 'object') return;
        if (data.channel !== INTENT_MESSAGE_CHANNEL || data.adapterId !== ADAPTER_ID) return;
        acceptSharedSubmitIntent(data.intent);
      }, true);
      const handleSubmitIntentEvent = (event, source) => {
        const target = event.target && event.target.closest ? event.target.closest('button,input,a,[role="button"],[class*="button"],[class*="Button"],[class*="btn"],[class*="Btn"],[class*="submit"],[class*="Submit"]') : null;
        const text = String(target?.textContent || target?.value || target?.getAttribute?.('aria-label') || target?.getAttribute?.('title') || '').trim();
        if (isSelfTestText(text) || isBlockedSubmitText(text)) {
          clearIntent();
          return;
        }
        if (isOfficialSubmitText(text)) markSubmitIntent(source);
      };
      ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach((eventName) => {
        document.addEventListener(eventName, (event) => handleSubmitIntentEvent(event, eventName), true);
      });
      document.addEventListener('keydown', (event) => {
        const key = String(event.key || event.code || '');
        const isEnter = key === 'Enter' || key === 'NumpadEnter' || event.keyCode === 13;
        if (!isEnter || (!event.ctrlKey && !event.metaKey)) return;
        markSubmitIntent('keyboard');
      }, true);
      document.addEventListener('submit', () => markSubmitIntent('form'), true);
    } catch (_) {}

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' ? input : input && input.url;
        const method = init?.method || (typeof input === 'object' && input ? input.method : '');
        const body = init?.body || (typeof input === 'object' && input ? input.body : undefined);
        if (isSelfTestRequest(requestUrl, body)) clearIntent();
        const isSubmitRequest = isOfficialSubmitRequest(requestUrl, method, body);
        if (isSubmitRequest) markSubmitIntent('fetch');
        const response = await originalFetch.apply(this, arguments);
        try {
          const cloned = response?.clone ? response.clone() : null;
          if (cloned?.json) {
            cloned.json()
              .then((json) => maybeReportNetworkResult(requestUrl, json))
              .catch(() => {
                try {
                  response.clone().text()
                    .then((text) => maybeReportNetworkResult(requestUrl, text))
                    .catch(() => {});
                } catch (_) {}
              });
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
      OriginalXHR.prototype.send = function(body) {
        try {
          if (isSelfTestRequest(this.__algoRequestUrl, body)) clearIntent();
          const isSubmitRequest = isOfficialSubmitRequest(this.__algoRequestUrl, this.__algoRequestMethod, body);
          if (isSubmitRequest) markSubmitIntent('xhr');
          this.addEventListener('loadend', function() {
            try {
              const responseBody = this.responseType === 'json' ? this.response : this.responseText;
              maybeReportNetworkResult(this.__algoRequestUrl, responseBody);
            } catch (_) {}
          });
        } catch (_) {}
        return originalSend.apply(this, arguments);
      };
    }
  })();`
}
