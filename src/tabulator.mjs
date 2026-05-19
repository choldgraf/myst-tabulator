/**
 * MyST plugin + anywidget for tabulator. Scans the article body and runs
 * Tabulator on each <table> in place — same light-DOM enhancement pattern
 * (and React-clobbering trade-off) as myst-lightbox and myst-searchfilter.
 */

// Dynamic import because this file is also evaluated in the browser, where
// `node:path` can't be resolved.
let pathMod;
try { pathMod = await import('node:path'); } catch {}
const PLUGIN_PATH = new URL(import.meta.url).pathname;

const TABULATOR_VERSION = '6.3.1';
const TABULATOR_CSS_URL = `https://cdn.jsdelivr.net/npm/tabulator-tables@${TABULATOR_VERSION}/dist/css/tabulator_simple.min.css`;
const TABULATOR_ESM_URL = `https://cdn.jsdelivr.net/npm/tabulator-tables@${TABULATOR_VERSION}/+esm`;

// Default scope: article content only, so theme chrome isn't enhanced.
const DEFAULT_INCLUDE = 'article.article table, main table';

// Normalize a <table> for Tabulator's HTML import:
//   1. Ensure a <thead> exists (MyST puts everything in <tbody>).
//   2. Collapse multi-row <thead> to the last row (pandas MultiIndex
//      headers use colspan/rowspan that Tabulator can't parse — without
//      this you get phantom columns).
//   3. Convert <th> cells in <tbody> to <td>. Pandas uses <th> for the
//      row-index column (describe(), groupby); Tabulator treats those
//      as extra header columns, which drops data and adds phantoms.
function normalizeTable(table) {
  if (!table.tHead) {
    const firstRow = table.querySelector('tr');
    if (firstRow) {
      const thead = document.createElement('thead');
      thead.appendChild(firstRow);
      table.insertBefore(thead, table.firstChild);
    }
  }
  if (table.tHead) {
    while (table.tHead.rows.length > 1) table.tHead.deleteRow(0);
  }
  for (const tbody of table.tBodies) {
    for (const row of tbody.rows) {
      for (let i = row.cells.length - 1; i >= 0; i--) {
        const cell = row.cells[i];
        if (cell.tagName === 'TH') {
          const td = document.createElement('td');
          td.innerHTML = cell.innerHTML;
          for (const attr of cell.attributes) td.setAttribute(attr.name, attr.value);
          row.replaceChild(td, cell);
        }
      }
    }
  }
}

// Tolerant number parser: returns null if the value isn't number-like.
// Strips a leading currency symbol, trailing percent, and thousand-separator
// commas. Then requires the result to match a real number literal
// so we don't convert dates etc.
function asNumber(v) {
  if (v == null) return null;
  const cleaned = String(v)
    .trim()
    .replace(/^([-+]?)[$£€¥₹]/, '$1')
    .replace(/%$/, '')
    .replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(cleaned)) return null;
  return parseFloat(cleaned);
}

// Numeric reducers for :summary: option. Tabulator's built-in sum/avg/min/max
// only handle raw numbers; these go through asNumber() so currency- and
// percent-formatted columns total up correctly. `count` and `concat` fall
// back to Tabulator's stock implementations (they work on any data).
const SUMMARY_REDUCERS = {
  sum: ns => ns.reduce((a, b) => a + b, 0),
  avg: ns => ns.reduce((a, b) => a + b, 0) / ns.length,
  min: ns => Math.min(...ns),
  max: ns => Math.max(...ns),
};
function summaryCalc(kind) {
  if (kind === 'count' || kind === 'concat') return kind;
  const reducer = SUMMARY_REDUCERS[kind];
  if (!reducer) return null;
  return values => {
    const nums = values.map(asNumber).filter(n => n !== null);
    return nums.length ? Math.round(reducer(nums) * 100) / 100 : '';
  };
}

// Tracks tables we've already handed to Tabulator. Module-scoped (rather
// than per-render) so that repeated render() calls — from hot reload,
// route remounts, anywidget re-renders — don't re-enhance the same DOM
// elements and stack up duplicate Copy buttons.
const enhanced = new WeakSet();

// Default sorter: numeric if both values parse as numbers (so `$3.50`
// and `12%` sort the way readers expect). Empty/null cells are always
// pushed to the bottom regardless of sort direction.
function smartSort(a, b, aRow, bRow, column, dir) {
  const aEmpty = a == null || String(a).trim() === '';
  const bEmpty = b == null || String(b).trim() === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return dir === 'desc' ? -1 : 1;
  if (bEmpty) return dir === 'desc' ? 1 : -1;

  const nA = asNumber(a);
  const nB = asNumber(b);
  if (nA !== null && nB !== null) return nA - nB;
  if (nA !== null) return -1;
  if (nB !== null) return 1;
  return String(a).localeCompare(String(b));
}

// Tailwind / theme resets strip the simple theme's input styling once
// Tabulator is in light DOM, leaving header-filter inputs invisible.
const FILTER_INPUT_CSS = `
  .tabulator .tabulator-header-filter input,
  .tabulator .tabulator-header-filter select {
    border: 1px solid #aaa;
    border-radius: 3px;
    padding: 2px 4px;
    background: #fff;
    color: #111;
    width: 100%;
    box-sizing: border-box;
  }
  .tabulator-row.tabulator-calcs {
    user-select: text;
  }
  .myst-tab-copy {
    display: block;
    width: fit-content;
    margin: 0 0 0.4rem auto;
    padding: 0.3rem 0.7rem;
    font-size: 0.85rem;
    border: 1px solid #aaa;
    border-radius: 4px;
    background: #fff;
    color: #111;
    cursor: pointer;
  }
`;

async function render({ model, el }) {
  el.style.display = 'none';

  const include = (model.get('include') || '').trim() || DEFAULT_INCLUDE;
  const exclude = (model.get('exclude') || '').trim();
  const userOptions = model.get('options') || {};

  // Default columnDefaults:
  //   - formatter:'html' so MyST-rendered <code>/<strong>/etc. display correctly.
  //   - sorter:smartSort handles both numeric-with-units and the empty-at-bottom rule.
  //   - bottomCalc applied per-column when :summary: is set.
  const summary = (model.get('summary') || '').trim();
  const bottomCalc = summary ? summaryCalc(summary) : null;
  const options = {
    ...userOptions,
    columnDefaults: {
      formatter: 'html',
      sorter: smartSort,
      ...(bottomCalc ? { bottomCalc } : {}),
      ...(userOptions.columnDefaults || {}),
    },
  };

  // Tabulator runs on light-DOM tables, so the stylesheet has to live in
  // document.head — the anywidget's shadow CSS doesn't reach them.
  if (!document.querySelector('link[data-myst-tabulator]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = TABULATOR_CSS_URL;
    link.dataset.mystTabulator = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('style[data-myst-tabulator]')) {
    const style = document.createElement('style');
    style.dataset.mystTabulator = '1';
    style.textContent = FILTER_INPUT_CSS;
    document.head.appendChild(style);
  }

  // Tabulator destroys the original <table> element when it enhances it,
  // so a dataset marker doesn't survive. Track enhanced elements in a
  // module-scoped WeakSet (declared at the top of the file) so duplicate
  // render() calls don't re-enhance the same table.
  let mod;

  function enhanceMatching() {
    if (!mod) return;
    const tables = document.querySelectorAll(include);
    const excluded = exclude ? new Set(document.querySelectorAll(exclude)) : null;
    for (const table of tables) {
      if (excluded?.has(table)) continue;
      if (enhanced.has(table)) continue;
      enhanced.add(table);
      try {
        normalizeTable(table);
        const t = new mod.TabulatorFull(table, options);

        // Place the Copy button as a sibling above Tabulator's wrapper
        const hasButton = t.element.previousElementSibling?.classList.contains('myst-tab-copy');
        if (options.clipboard === 'copy' && !hasButton) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'myst-tab-copy';
          btn.textContent = 'Copy';
          let resetTimer;
          btn.addEventListener('click', async () => {
            clearTimeout(resetTimer);
            try {
              await t.copyToClipboard();
              btn.textContent = 'Copied!';
            } catch {
              btn.textContent = 'Copy failed';
            }
            resetTimer = setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
          });
          t.element.insertAdjacentElement('beforebegin', btn);
        }
      } catch (err) {
        console.warn('myst-tabulator: failed to enhance', table, err);
      }
    }
  }

  // Catch tables added after our initial pass (thebe attaches code-cell
  // outputs asynchronously). MutationObserver is the fast path; the
  // timed retries are a belt-and-suspenders for cases where the observer
  // misses the addition (e.g. shadow-DOM-scoped mutations).
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; enhanceMatching(); });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  try {
    mod = await import(TABULATOR_ESM_URL);
  } catch (err) {
    console.warn('myst-tabulator: failed to load Tabulator', err);
    return;
  }
  enhanceMatching();
  for (const delay of [500, 1500, 4000]) setTimeout(enhanceMatching, delay);
}

const tabulatorDirective = {
  name: 'tabulator',
  doc: 'Enhance every <table> in the article body with Tabulator. Scope with :selector-include: / :selector-exclude:.',
  options: {
    'selector-include': {
      type: String,
      doc: `CSS selector for tables to enhance. Default: ${DEFAULT_INCLUDE}`,
    },
    'selector-exclude': {
      type: String,
      doc: 'CSS selector for tables to skip.',
    },
    pagination: { type: Boolean, doc: 'Enable local pagination.' },
    'page-size': { type: Number, doc: 'Rows per page when pagination is enabled.' },
    'header-filter': { type: Boolean, doc: 'Add a filter input under each column header.' },
    copy: { type: Boolean, doc: 'Show a "Copy" button above the table that copies the visible rows to the clipboard.' },
    summary: { type: String, doc: 'Show a bottom row with a calculated value per column. One of: sum, avg, min, max, count, concat.' },
    layout: { type: String, doc: 'Tabulator layout mode (e.g. fitColumns, fitData, fitDataFill).' },
    'no-sort': { type: Boolean, doc: 'Disable click-to-sort on column headers.' },
    'tabulator-options': {
      type: String,
      doc: 'Raw JSON merged into the Tabulator constructor options (last-write-wins).',
    },
  },
  run(data, vfile) {
    const opts = data.options ?? {};

    let extra;
    const raw = opts['tabulator-options'];
    if (raw && raw.trim()) {
      try {
        extra = JSON.parse(raw);
      } catch (err) {
        vfile.message(
          `tabulator: could not parse :tabulator-options: as JSON - ${err.message}`,
        );
      }
    }

    const tabulatorOpts = {};
    const colDefaults = {};
    if (opts.pagination) tabulatorOpts.pagination = 'local';
    if (typeof opts['page-size'] === 'number') tabulatorOpts.paginationSize = opts['page-size'];
    if (opts['header-filter']) colDefaults.headerFilter = 'input';
    if (opts['no-sort']) colDefaults.headerSort = false;
    if (opts.layout) tabulatorOpts.layout = opts.layout;
    if (opts.copy) {
      tabulatorOpts.clipboard = 'copy';
      tabulatorOpts.clipboardCopyRowRange = 'active';
      // Explicit copy config: include headers, exclude everything synthetic
      // (calc rows, groups, tree summaries) so :summary: totals don't leak
      // into the clipboard alongside the data rows.
      tabulatorOpts.clipboardCopyConfig = {
        columnHeaders: true,
        columnGroups: false,
        rowGroups: false,
        columnCalcs: false,
        dataTree: false,
      };
    }
    if (Object.keys(colDefaults).length > 0) tabulatorOpts.columnDefaults = colDefaults;
    if (extra) Object.assign(tabulatorOpts, extra);

    const allowedSummary = ['sum', 'avg', 'min', 'max', 'count', 'concat'];
    if (opts.summary && !allowedSummary.includes(opts.summary)) {
      vfile.message(
        `tabulator: :summary: must be one of ${allowedSummary.join('|')}, got "${opts.summary}"`,
      );
    }

    return [{
      type: 'anywidget',
      esm: pathMod.relative(pathMod.dirname(vfile.path), PLUGIN_PATH),
      model: {
        include: opts['selector-include'] ?? '',
        exclude: opts['selector-exclude'] ?? '',
        options: tabulatorOpts,
        summary: opts.summary ?? '',
      },
      id: crypto.randomUUID(),
    }];
  },
};

export default {
  name: 'tabulator',
  directives: [tabulatorDirective],
  render,
};
