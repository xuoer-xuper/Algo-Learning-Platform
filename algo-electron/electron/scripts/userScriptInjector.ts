import type { TabManager } from '../browser/TabManager'
import type { UserScriptService } from './UserScriptService'

interface InstallUserScriptInjectionOptions {
  tabManager: TabManager
  getUserScriptService: () => UserScriptService | null
}

function getErrorMessage(error: unknown): unknown {
  return error instanceof Error ? error.message : error
}

export function installUserScriptInjection(options: InstallUserScriptInjectionOptions): void {
  const { tabManager, getUserScriptService } = options

  tabManager.setPageLoadedCallback(async (url) => {
    console.log('[UserScript] Page loaded:', url)

    const userScriptService = getUserScriptService()
    if (!userScriptService) {
      console.log('[UserScript] SKIP: service is null')
      return
    }

    const entries = userScriptService.getMatchingScriptsWithMeta(url)
    console.log('[UserScript] Matching scripts:', entries.length)

    for (const { script, requires, resources } of entries) {
      console.log('[UserScript] Injecting:', script.name, 'requires:', requires.length, 'resources:', resources.length, 'code length:', script.code?.length ?? 0)
      try {
        const resourceMap: Record<string, string> = {}
        for (const res of resources) {
          resourceMap[res.name] = res.url
        }

        // The page sandbox receives only userscript-compatible helpers and resource URLs.
        // User code itself stays in the OJ WebContents and is not logged or sent to renderer.
        const polyfills = `
          window.unsafeWindow = window;
          window.GM_addStyle = (css) => {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
          };
          window.GM_info = {
            script: {
              name: ${JSON.stringify(script.name)},
              version: ${JSON.stringify(script.version || '1.0')}
            }
          };
          window.GM_getValue = (key, def) => {
            try {
              const val = localStorage.getItem('GM_' + key);
              return val !== null ? JSON.parse(val) : def;
            } catch { return def; }
          };
          window.GM_setValue = (key, val) => {
            localStorage.setItem('GM_' + key, JSON.stringify(val));
          };
          window.GM_deleteValue = (key) => {
            localStorage.removeItem('GM_' + key);
          };
          window.GM_listValues = () => {
            const keys = [];
            for(let i = 0; i < localStorage.length; i++){
              const key = localStorage.key(i);
              if(key && key.startsWith('GM_')) keys.push(key.substring(3));
            }
            return keys;
          };
          window.GM_xmlhttpRequest = (details) => {
            const controller = new AbortController();
            fetch(details.url, {
              method: details.method || 'GET',
              headers: details.headers,
              body: details.data,
              signal: controller.signal
            }).then(async r => {
              const text = await r.text();
              const resp = { status: r.status, statusText: r.statusText, responseText: text, responseHeaders: '' };
              if(details.onload) details.onload(resp);
            }).catch(e => {
              if(details.onerror) details.onerror(e);
            });
            return { abort: () => controller.abort() };
          };
          window.GM_setClipboard = (text) => {
            navigator.clipboard && navigator.clipboard.writeText(text);
          };
          window.__GM_RESOURCE_URLS__ = ${JSON.stringify(resourceMap)};
          window.__GM_RESOURCE_CACHE__ = window.__GM_RESOURCE_CACHE__ || {};
          window.GM_getResourceText = (name) => {
            if(window.__GM_RESOURCE_CACHE__[name] !== undefined) return window.__GM_RESOURCE_CACHE__[name];
            return '';
          };
          window.GM_getResourceURL = (name) => {
            return window.__GM_RESOURCE_URLS__[name] || '';
          };
          void 0;
        `
        await tabManager.executeScript(polyfills)
        console.log('[UserScript] Polyfills injected for:', script.name)

        if (resources.length > 0) {
          const fetchResourcesCode = `
            (async () => {
              const urls = window.__GM_RESOURCE_URLS__;
              for (const [name, url] of Object.entries(urls)) {
                try {
                  const resp = await fetch(url);
                  window.__GM_RESOURCE_CACHE__[name] = await resp.text();
                } catch(e) {
                  console.warn('[UserScript] Failed to fetch resource:', name, e);
                  window.__GM_RESOURCE_CACHE__[name] = '';
                }
              }
              return void 0;
            })()
          `
          await tabManager.executeScript(fetchResourcesCode)
          console.log('[UserScript] Resources fetched for:', script.name)
        }

        if (requires.length > 0) {
          const loadRequiresCode = `
            (async () => {
              const urls = ${JSON.stringify(requires)};
              for (const url of urls) {
                await new Promise((resolve, reject) => {
                  const s = document.createElement('script');
                  s.src = url;
                  s.onload = resolve;
                  s.onerror = (e) => { console.warn('[UserScript] Failed to load require:', url, e); resolve(e); };
                  (document.head || document.documentElement).appendChild(s);
                });
              }
              return void 0;
            })()
          `
          await tabManager.executeScript(loadRequiresCode)
          console.log('[UserScript] Requires loaded for:', script.name)
        }

        await tabManager.executeScript(`${script.code}\n; void 0;`)
        console.log('[UserScript] Script executed OK:', script.name)
      } catch (error) {
        console.error('[UserScript Failed]', script.name, getErrorMessage(error))
      }
    }
  })
}
