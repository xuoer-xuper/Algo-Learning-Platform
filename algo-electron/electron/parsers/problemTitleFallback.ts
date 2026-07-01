export function createProblemTitleFallbackScript(url: string): string | null {
  try {
    const parsed = new URL(url)

    if (parsed.hostname === 'codeforces.com' || parsed.hostname === 'www.codeforces.com') {
      return `
        (() => {
          const clean = (text) => String(text || '').replace(/\\s+/g, ' ').trim();
          const pick = (...selectors) => {
            for (const selector of selectors) {
              const value = clean(document.querySelector(selector)?.textContent);
              if (value) return value;
            }
            return '';
          };
          return pick(
            '.problemindexholder .title',
            '.problem-statement .title',
            'div.title'
          );
        })()
      `
    }

    if (parsed.hostname === 'www.acwing.com' || parsed.hostname === 'acwing.com') {
      return `
        (() => {
          const selectors = [
            '.problem-content-title',
            '.problem-content h1',
            '.problem-content h2',
            '.problem-content h3',
            'h1',
            'h2'
          ];
          for (const selector of selectors) {
            const value = document.querySelector(selector)?.textContent?.trim();
            if (value) return value;
          }
          return '';
        })()
      `
    }
  } catch {
    return null
  }

  return null
}
