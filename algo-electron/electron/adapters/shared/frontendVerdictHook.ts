export function createFrontendVerdictHookScript(adapterId: string): string {
  return `(() => {
    const CHANNEL = '__algo_submission_v1';
    const ADAPTER_ID = ${JSON.stringify(adapterId)};
    const DOM_VERDICT_REPORTING_ENABLED = ADAPTER_ID !== 'nowcoder';
    const INTENT_KEY = '__ALGO_SUBMIT_INTENT_' + ADAPTER_ID;
    const INTENT_MESSAGE_CHANNEL = CHANNEL + ':submit-intent';
    const INSTALLED_KEY = '__ALGO_FRONTEND_VERDICT_HOOKS__';
    const FINAL_STABLE_DELAY = 900;
    const SCAN_DELAYS = [300, 800, 1500, 3000, 6000, 10000];
    window[INSTALLED_KEY] = window[INSTALLED_KEY] || {};
    const state = window[INSTALLED_KEY][ADAPTER_ID] || {
      observerInstalled: false,
      listenersInstalled: false,
      networkInstalled: false,
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
          return /^\\/(?:practice|questionTerminal)\\/[^/]+\\/?$/i.test(path);
        }
        return host === 'ac.nowcoder.com'
          && (/^\\/acm\\/problem\\/\\d+\\/?$/.test(path)
            || /^\\/acm\\/contest\\/\\d+\\/(?!status|rank|ranking|submission|submissions|view-submission)([^/]+)\\/?$/i.test(path));
      }
      return true;
    };
    const isSubmissionResultPage = (urlValue = getTopPageUrl()) => {
      const parsed = parseUrl(urlValue);
      if (!parsed) return false;
      const host = String(parsed.hostname || '');
      const path = String(parsed.pathname || '');
      if (ADAPTER_ID === 'acwing') {
        return /^(?:www\\.)?acwing\\.com$/.test(host)
          && /^\\/problem\\/submission\\/\\d+\\/?$/.test(path);
      }
      if (ADAPTER_ID === 'nowcoder') {
        return host === 'ac.nowcoder.com'
          && (/^\\/acm\\/contest\\/view-submission\\/?$/i.test(path)
            || /^\\/acm\\/contest\\/\\d+\\/submission\\/\\d+\\/?$/i.test(path));
      }
      if (ADAPTER_ID === 'vjudge') {
        return /^(?:www\\.)?vjudge\\.net$/.test(host)
          && (/^\\/solution\\/\\d+\\/?$/.test(path)
            || /^\\/problem\\/view\\/submission\\/\\d+\\/?$/.test(path));
      }
      return false;
    };
    const writeIntent = (intent) => {
      try {
        sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
      } catch (_) {}
    };
    // Submit intent is the safety boundary: modal/table verdicts are trusted only
    // after a recent formal submit action from a recognized problem page.
    const clearIntent = () => {
      try {
        sessionStorage.removeItem(INTENT_KEY);
      } catch (_) {}
      state.lastResultKey = '';
      state.pendingResultKey = '';
      clearTimeout(state.pendingTimer);
    };
    const scheduleDocumentScans = () => {
      if (!DOM_VERDICT_REPORTING_ENABLED) return;
      SCAN_DELAYS.forEach((delay) => setTimeout(scanDocument, delay));
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
        state.lastResultKey = '';
        writeIntent({
          id: intent.id,
          at: now(),
          source: typeof intent.source === 'string' ? intent.source : 'frame',
          pageUrl: intent.pageUrl,
          language: typeof intent.language === 'string' ? intent.language : ''
        });
        scheduleDocumentScans();
        return true;
      } catch (_) {
        return false;
      }
    };
    const markSubmitIntent = (source) => {
      if (!isProblemPage()) return;
      const current = readIntent();
      const id = current.id && now() - current.at < 1000 ? current.id : String(now().toString(36) + Math.random().toString(36).slice(2, 8));
      state.lastResultKey = '';
      const intent = {
        id,
        at: now(),
        source,
        pageUrl: getTopPageUrl(),
        language: detectPageLanguage()
      };
      writeIntent(intent);
      shareSubmitIntent(intent);
      return intent;
    };
    const hasRecentSubmitIntent = () => {
      const intent = readIntent();
      const fresh = typeof intent.at === 'number'
        && now() - intent.at < 5 * 60 * 1000
        && typeof intent.id === 'string'
        && intent.id;
      if (!fresh) return false;
      const intentPageIsProblem = typeof intent.pageUrl === 'string' && isProblemPage(intent.pageUrl);
      return isProblemPage() || (intentPageIsProblem && isSubmissionResultPage());
    };
    const maybeSubmitUrl = (requestUrl, method) => {
      const url = String(requestUrl || '').toLowerCase();
      const verb = String(method || 'GET').toUpperCase();
      if (verb !== 'POST' && verb !== 'PUT' && verb !== 'PATCH') return false;
      if (/view|history|record-list|submission-list|view-submission|submissionid|detail|status/.test(url)) return false;
      if (ADAPTER_ID === 'nowcoder') {
        const isNowcoderSelfTestUrl = /(?:^|[/?&#=_-])(?:self|custom|sample|test|testcase|debug|trial|run|compile|execute)(?:$|[/?&#=_-])|自测|调试|运行|样例|测试/.test(url);
        if (isNowcoderSelfTestUrl) {
          clearIntent();
          return false;
        }
        const isNowcoderOfficialSubmitUrl = /(?:^|[/?&#=_-])(?:submit|submission|commit|answer|coding)(?:$|[/?&#=_-])|\\/api\\/.{0,80}(?:submit|submission|commit|answer|coding)/.test(url);
        if (isNowcoderOfficialSubmitUrl) return true;
        return false;
      }
      return /submit|submission|judge|coding|answer|commit/.test(url);
    };
    const isNowcoderJudgeStatusUrl = (requestUrl) => {
      if (ADAPTER_ID !== 'nowcoder') return false;
      const url = String(requestUrl || '').toLowerCase();
      return /\\/api\\/service\\/judge\\/submit-status(?:[/?#]|$)/.test(url)
        || /(?:code|judge|submit).*status/.test(url);
    };
    const unwrapNowcoderJudgeData = (value) => {
      if (!value || typeof value !== 'object') return null;
      const data = value.data && typeof value.data === 'object' ? value.data : value;
      return data && typeof data === 'object' ? data : null;
    };
    const isFinalNowcoderJudgeData = (value) => {
      const data = unwrapNowcoderJudgeData(value);
      if (!data) return false;
      if (data.isSelfTest || data.submitType === 2 || data.isSelfTest === 'true') return false;
      const status = Number(data.status ?? data.statusCode);
      if (Number.isFinite(status) && status >= 3) return true;
      const text = [
        data.judgeReplyDesc,
        data.enJudgeReplyDesc,
        data.desc,
        data.enDesc,
        data.memo,
        data.enMemo
      ].filter(Boolean).join(' ');
      return Boolean(text && !pendingPattern.test(text) && pickVerdict(text, true));
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
    const isNowcoderSelfTestText = (text) => ADAPTER_ID === 'nowcoder'
      && /自测|调试|运行|run|test|样例|测试/i.test(text)
      && !/提交|submit/i.test(text);
    const isOfficialSubmitText = (text) => {
      const value = String(text || '').replace(/\\s+/g, ' ').trim();
      if (!/提交|submit/i.test(value)) return false;
      if (/查看|上次|记录|详情|历史|列表|状态|结果|我的提交|提交记录|View|Last|History|Record|Detail|Status|Result|Submission\\s+List/i.test(value)) {
        return false;
      }
      if (ADAPTER_ID === 'nowcoder') {
        if (/提交/.test(value) && value.length <= 60) return true;
        if (/^Submit\\b/i.test(value) && value.length <= 50) return true;
        if (/^Save\\s+and\\s+Submit$/i.test(value)) return true;
      }
      return /^(提交|提交答案|提交代码|提交评测|提交并评测|Submit|Submit\\s+Answer|Submit\\s+Code|Submit\\s+Solution)$/i.test(value);
    };
    const isBlockedSubmitText = (text) => /查看|上次|记录|详情|历史|列表|状态|结果|我的提交|提交记录|View|Last|History|Record|Detail|Status|Result|Submission\\s+List/i.test(String(text || ''));
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
    const attrsOf = (element) => {
      try {
        if (!element || element.nodeType !== 1) return '';
        return [
          element.id,
          element.className,
          element.getAttribute?.('role'),
          element.getAttribute?.('title'),
          element.getAttribute?.('aria-label'),
          element.getAttribute?.('placeholder'),
          element.getAttribute?.('name')
        ].filter(Boolean).join(' ');
      } catch (_) {
        return '';
      }
    };
    const selfTestContextPattern = /自测|调试|样例测试|自定义测试|测试输入|自测输入|自定义输入|输入数据|输出数据|标准输入|程序输出|custom\\s*test|sample\\s*test|self\\s*test|testcase/i;
    const isTextInputControl = (element) => {
      try {
        if (!element || element.nodeType !== 1) return false;
        const tag = String(element.tagName || '').toLowerCase();
        if (tag === 'textarea') return true;
        if (tag === 'input') {
          const type = String(element.getAttribute?.('type') || element.type || 'text').toLowerCase();
          return !/button|submit|reset|checkbox|radio|hidden|file|image/.test(type);
        }
        if (element.getAttribute?.('contenteditable') === 'true') return true;
        return element.getAttribute?.('role') === 'textbox';
      } catch (_) {
        return false;
      }
    };
    const selfTestInputContext = (control) => {
      try {
        const parts = [attrsOf(control)];
        let current = control;
        for (let depth = 0; current && depth < 3; depth++) {
          parts.push(attrsOf(current));
          parts.push(textOf(current).slice(0, 300));
          current = current.parentElement;
        }
        return parts.join(' ');
      } catch (_) {
        return '';
      }
    };
    const hasSelfTestInputBox = (element) => {
      try {
        if (!element || element.nodeType !== 1) return false;
        const controls = [];
        if (isTextInputControl(element)) controls.push(element);
        element.querySelectorAll?.('textarea,input,[contenteditable="true"],[role="textbox"]').forEach((control) => {
          if (isTextInputControl(control)) controls.push(control);
        });
        return controls.some((control) => selfTestContextPattern.test(selfTestInputContext(control)));
      } catch (_) {
        return false;
      }
    };
    const isNowcoderSelfTestCandidate = (candidate, text) => {
      if (ADAPTER_ID !== 'nowcoder') return false;
      const value = String(text || '').replace(/\\s+/g, ' ').trim();
      if (/提交记录|正式提交|submission/i.test(value)) return false;
      if (/自测输入|测试输入|自定义输入|自定义测试|输入数据|输出数据/i.test(value)) return true;
      if (/(?:自测|调试)\\s*(?:结果|运行结果|通过|成功|失败|答案)|样例测试|custom\\s*test|sample\\s*test/i.test(value)) return true;
      if (/(?:自测|调试).{0,80}(?:输入|输出|stdin|stdout|运行结果|样例)/i.test(value)) return true;
      if (/\\btestcase\\b/i.test(value) && /\\b(?:self|custom|sample)\\b/i.test(value)) return true;
      if (!hasSelfTestInputBox(candidate)) return false;
      return selfTestContextPattern.test([attrsOf(candidate), value].join(' '));
    };
    const languagePattern = /(?:GNU\\s+)?C\\+\\+\\s*\\d*(?:\\s*\\([^)]+\\))?|(?:GNU\\s+)?C(?:\\s*\\([^)]+\\))?|JavaScript|TypeScript|Python\\s*\\d*|PyPy\\s*\\d*|Java|Go|Rust|Pascal|GCC|Clang/i;
    const pickLanguage = (value) => {
      const text = String(value || '').replace(/\\s+/g, ' ').trim();
      if (!text || text.length > 120) return '';
      const match = text.match(languagePattern);
      return match ? match[0].replace(/\\s+/g, ' ').trim() : '';
    };
    const detectPageLanguage = () => {
      try {
        const selectedOptions = Array.from(document.querySelectorAll('select option:checked'));
        for (const option of selectedOptions) {
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
    const strictVerdictPatterns = [
      { verdict: '答案正确', pattern: /答案正确|Accepted|恭喜.*通过|已通过|(?:全部|所有)测试用例(?:均)?通过|通过(?:了)?(?:本题|全部|所有)(?:测试用例)?|(^|\\s)通过(\\s|$)/i },
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
    const readTestcasePassFraction = (text) => {
      const match = String(text || '').match(/通过(?:了)?\\s*(\\d+)\\s*\\/\\s*(\\d+)/i);
      if (!match) return null;
      const passed = Number(match[1]);
      const total = Number(match[2]);
      if (!Number.isFinite(passed) || !Number.isFinite(total) || total <= 0) return null;
      return { passed, total };
    };
    const pickVerdict = (text, isLikelyElement) => {
      if (!text || pendingPattern.test(text)) return '';
      const testcasePassFraction = readTestcasePassFraction(text);
      if (
        /答案错误|Wrong\\s+Answer|未通过(?:本题|全部|所有|测试用例)|(?:没有|没)通过(?:本题|全部|所有|测试用例)|(?:全部|所有)?测试用例.{0,16}未通过|部分(?:测试用例)?(?:正确|通过)/i.test(text)
        || (testcasePassFraction && testcasePassFraction.passed < testcasePassFraction.total)
      ) return '答案错误';
      for (const item of strictVerdictPatterns) {
        if (item.pattern.test(text)) return item.verdict;
      }
      if (testcasePassFraction && testcasePassFraction.passed === testcasePassFraction.total) return '答案正确';
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
        document.querySelectorAll('[role="dialog"],[class*="result"],[class*="status"],[class*="judge"],[class*="submit"],[class*="answer"],[class*="message"],[class*="modal"],[class*="dialog"],[class*="toast"],[class*="alert"],[class*="notice"],[class*="popup"],[class*="pop"],[class*="layer"],[class*="success"],[class*="pass"],[class*="accepted"],[id*="result"],[id*="status"],[id*="judge"],[id*="submit"],[id*="answer"],[id*="modal"],[id*="dialog"],[id*="notice"],[id*="popup"],[id*="success"],[id*="pass"],[id*="accepted"]').forEach((item) => candidates.push(item));
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
    const reportNetworkResult = (requestUrl, result) => {
      try {
        const intent = readIntent();
        if (!hasRecentSubmitIntent()) return;
        if (!isFinalNowcoderJudgeData(result)) return;
        const data = unwrapNowcoderJudgeData(result) || result;
        const verdictText = String(data.judgeReplyDesc || data.enJudgeReplyDesc || data.desc || data.enDesc || data.memo || data.status || '');
        const key = intent.id + ':network:' + String(data.submissionId || data.id || '') + ':' + String(data.status || '') + ':' + verdictText;
        if (state.lastResultKey === key) return;
        state.lastResultKey = key;
        const effectivePageUrl = typeof intent.pageUrl === 'string'
          && isProblemPage(intent.pageUrl)
          ? intent.pageUrl
          : getTopPageUrl();
        const payload = {
          adapterId: ADAPTER_ID,
          pageUrl: effectivePageUrl,
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
    const maybeReportNowcoderNetworkResult = (requestUrl, body) => {
      try {
        if (!isNowcoderJudgeStatusUrl(requestUrl)) return;
        const parsed = parseJsonMaybe(body);
        if (!parsed) return;
        reportNetworkResult(requestUrl, parsed);
      } catch (_) {}
    };
    const report = (candidate, text, verdictText) => {
      try {
        if (!DOM_VERDICT_REPORTING_ENABLED) return;
        const intent = readIntent();
        if (!hasRecentSubmitIntent()) return;
        if (isNowcoderSelfTestCandidate(candidate, text)) return;
        const key = intent.id + ':' + verdictText + ':' + text.slice(0, 200);
        if (state.lastResultKey === key) return;
        state.lastResultKey = key;
        const effectivePageUrl = typeof intent.pageUrl === 'string'
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
            links: linksOf(candidate),
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
    // Result modals often render "judging" then mutate in place; re-read the same
    // candidate after a short delay before reporting a final verdict.
    const scheduleReport = (candidate, text, verdictText, isLikelyElement) => {
      try {
        if (!DOM_VERDICT_REPORTING_ENABLED) return;
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
            if (isNowcoderSelfTestCandidate(candidate, latestText)) return;
            const latestVerdictText = pickVerdict(latestText, isLikelyElement);
            if (latestVerdictText !== verdictText) return;
            report(candidate, latestText, latestVerdictText);
          } catch (_) {}
        }, FINAL_STABLE_DELAY);
      } catch (_) {}
    };
    const scanNode = (node) => {
      if (!DOM_VERDICT_REPORTING_ENABLED) return;
      if (!hasRecentSubmitIntent()) return;
      for (const candidate of candidatesFrom(node)) {
        const text = textOf(candidate);
        if (!text || text.length > 5000) continue;
        if (isNowcoderSelfTestCandidate(candidate, text)) continue;
        const isLikely = isLikelyResultElement(candidate);
        const verdictText = pickVerdict(text, isLikely);
        if (!verdictText) continue;
        if (!isLikely && text.length > 800) continue;
        scheduleReport(candidate, text, verdictText, isLikely);
        return;
      }
    };
    const scanDocument = () => {
      if (!DOM_VERDICT_REPORTING_ENABLED) return;
      if (!document.body) return;
      scanNode(document.body);
    };

    try {
      if (!state.listenersInstalled) {
        state.listenersInstalled = true;
        window.addEventListener('message', (event) => {
          const data = event && event.data;
          if (!data || typeof data !== 'object') return;
          if (data.channel !== INTENT_MESSAGE_CHANNEL || data.adapterId !== ADAPTER_ID) return;
          acceptSharedSubmitIntent(data.intent);
        }, true);
        const handleSubmitIntentEvent = (event, source) => {
          const target = event.target && event.target.closest ? event.target.closest('button,input,a,[role="button"],[class*="button"],[class*="Button"],[class*="btn"],[class*="Btn"],[class*="submit"],[class*="Submit"]') : null;
          const text = String(target?.textContent || target?.value || target?.getAttribute?.('aria-label') || '').trim();
          if (isNowcoderSelfTestText(text) || isBlockedSubmitText(text)) {
            clearIntent();
            return;
          }
          if (isOfficialSubmitText(text)) {
            markSubmitIntent(source);
            scheduleDocumentScans();
          }
        };
        ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach((eventName) => {
          document.addEventListener(eventName, (event) => handleSubmitIntentEvent(event, eventName), true);
        });
        document.addEventListener('keydown', (event) => {
          if (ADAPTER_ID !== 'nowcoder') return;
          const key = String(event.key || event.code || '');
          const isEnter = key === 'Enter' || key === 'NumpadEnter' || event.keyCode === 13;
          if (!isEnter || (!event.ctrlKey && !event.metaKey)) return;
          markSubmitIntent('keyboard');
          scheduleDocumentScans();
        }, true);
        document.addEventListener('submit', () => {
          markSubmitIntent('form');
          scheduleDocumentScans();
        }, true);
      }
    } catch (_) {}

    if (!state.networkInstalled) {
      state.networkInstalled = true;
      const originalFetch = window.fetch;
      if (typeof originalFetch === 'function') {
        window.fetch = async function(input, init) {
          const requestUrl = typeof input === 'string' ? input : input && input.url;
          const method = init?.method || (typeof input === 'object' && input ? input.method : '');
          if (maybeSubmitUrl(requestUrl, method)) {
            markSubmitIntent('fetch');
            scheduleDocumentScans();
          }
          const response = await originalFetch.apply(this, arguments);
          try {
            if (isNowcoderJudgeStatusUrl(requestUrl)) {
              const cloned = response?.clone ? response.clone() : null;
              if (cloned?.json) {
                cloned.json()
                  .then((body) => maybeReportNowcoderNetworkResult(requestUrl, body))
                  .catch(() => {
                    try {
                      response.clone().text()
                        .then((text) => maybeReportNowcoderNetworkResult(requestUrl, text))
                        .catch(() => {});
                    } catch (_) {}
                  });
              }
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
          try {
            if (isNowcoderJudgeStatusUrl(this.__algoRequestUrl) && this.addEventListener) {
              this.addEventListener('loadend', () => {
                try {
                  const body = this.responseType === 'json' ? this.response : this.responseText;
                  maybeReportNowcoderNetworkResult(this.__algoRequestUrl, body);
                } catch (_) {}
              });
            }
          } catch (_) {}
          if (maybeSubmitUrl(this.__algoRequestUrl, this.__algoRequestMethod)) {
            markSubmitIntent('xhr');
            scheduleDocumentScans();
          }
          return originalSend.apply(this, arguments);
        };
      }
    }

    const installObserver = () => {
      try {
        if (!DOM_VERDICT_REPORTING_ENABLED) return false;
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
        [0, ...SCAN_DELAYS].forEach((delay) => setTimeout(scanDocument, delay));
      }
    } catch (_) {}
  })();`
}

