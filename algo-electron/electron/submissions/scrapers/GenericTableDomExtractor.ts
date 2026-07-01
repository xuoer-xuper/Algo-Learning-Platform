export const EXTRACT_GENERIC_TABLES_SCRIPT = `
  (() => {
    const textOf = (element) => {
      const clone = element.cloneNode(true);
      clone.querySelectorAll('script,style,noscript').forEach((node) => node.remove());
      return (clone.textContent || '').trim();
    };

      const tables = Array.from(document.querySelectorAll('table')).map((table) => {
      let headers = Array.from(table.querySelectorAll('thead th, thead td')).map(textOf);
      if (!headers.length) {
        const firstRow = table.querySelector('tr');
        if (firstRow) {
          headers = Array.from(firstRow.querySelectorAll('th')).map(textOf);
        }
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
          rowId: row.id || row.getAttribute('data-id') || row.getAttribute('data-runid') || '',
        };
      }).filter((row) => row.texts.length >= 2);

      return { headers, rows };
    });

      return { tables };
  })()
`
