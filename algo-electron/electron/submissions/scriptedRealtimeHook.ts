export function createScriptedRealtimeHookScript(
  adapterId: string,
  extractExpression: string,
  shouldReportExpression = '() => true',
): string {
  return `(() => {
    const CHANNEL = '__algo_submission_v1';
    const ADAPTER_ID = ${JSON.stringify(adapterId)};
    const INSTALLED_KEY = '__ALGO_SCRIPTED_HOOKS__';
    window[INSTALLED_KEY] = window[INSTALLED_KEY] || {};
    const state = window[INSTALLED_KEY][ADAPTER_ID] || {
      observerInstalled: false,
      intervalId: 0
    };
    window[INSTALLED_KEY][ADAPTER_ID] = state;

    const extract = async () => (${extractExpression});
    const shouldReportExtracted = ${shouldReportExpression};
    // Adapters supply shouldReportExtracted when the source page exposes pending
    // records before testcase details settle. The hook only transports data that
    // passes that site-specific readiness gate.
    const report = async () => {
      try {
        const response = await extract();
        if (!response) return;
        if (!shouldReportExtracted(response)) return;
        const payload = {
          adapterId: ADAPTER_ID,
          pageUrl: location.href,
          requestUrl: location.href,
          response,
          meta: { pageTitle: typeof document !== 'undefined' ? document.title : '' },
          detectedAt: new Date().toISOString(),
        };
        if (window[CHANNEL] && typeof window[CHANNEL].reportSubmission === 'function') {
          window[CHANNEL].reportSubmission(payload);
        } else {
          window.postMessage({ channel: CHANNEL, payload }, '*');
        }
      } catch (_) {}
    };

    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(report, 600);
    };

    [0, 1000, 2500, 5000, 9000].forEach((delay) => setTimeout(report, delay));
    if (!state.intervalId) {
      state.intervalId = setInterval(report, 15000);
    }

    try {
      if (!state.observerInstalled && typeof MutationObserver !== 'undefined' && document.body) {
        state.observerInstalled = true;
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    } catch (_) {}
  })();`
}
