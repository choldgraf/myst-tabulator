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

// Tolerant number parser: returns null if the value isn't number-like,
// after stripping currency symbols ($), percent signs, thousands
// separators, and surrounding whitespace.
// This is necessary so we can sort numeric columns w/ these special characters.
function asNumber(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s.replace(/[^\d.\-+eE]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '+' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// Default sorter: numeric if both values parse as numbers (so `$3.50`
// and `12%` sort the way readers expect)
function smartSort(a, b) {
  const nA = asNumber(a);
  const nB = asNumber(b);
  if (nA !== null && nB !== null) return nA - nB;
  if (nA !== null) return -1;
  if (nB !== null) return 1;
  return String(a ?? '').localeCompare(String(b ?? ''));
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
  .tabulator .myst-tab-copy {
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
  //   - sorter:smartSort so `$3.50` and `12%` sort numerically rather than alphabetically.
  const options = {
    ...userOptions,
    columnDefaults: {
      formatter: 'html',
      sorter: smartSort,
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
  // WeakSet keyed on the element we hand to Tabulator.
  const enhanced = new WeakSet();
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

        // If :copy: is enabled, build the button as a real DOM element so
        // we can keep a stable reference to it (Tabulator may swap out
        // `t.element` while it constructs, but it places the footerElement
        // node verbatim — no clone).
        let copyBtn = null;
        const tableOptions = { ...options };
        if (tableOptions.clipboard === 'copy') {
          copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'myst-tab-copy';
          copyBtn.textContent = 'Copy';
          tableOptions.footerElement = copyBtn;
        }

        const t = new mod.TabulatorFull(table, tableOptions);

        if (copyBtn) {
          let resetTimer;
          copyBtn.addEventListener('click', async () => {
            clearTimeout(resetTimer);
            try {
              await t.copyToClipboard();
              copyBtn.textContent = 'Copied!';
            } catch {
              copyBtn.textContent = 'Copy failed';
            }
            resetTimer = setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
          });
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
    copy: { type: Boolean, doc: 'Show a "Copy" button (in the table footer) that copies the visible rows to the clipboard.' },
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
      tabulatorOpts.clipboardCopyConfig = { columnHeaders: true };
      // footerElement is built per-table in render() so we can keep a live
      // reference to the actual button for wiring.
    }
    if (Object.keys(colDefaults).length > 0) tabulatorOpts.columnDefaults = colDefaults;
    if (extra) Object.assign(tabulatorOpts, extra);

    return [{
      type: 'anywidget',
      esm: pathMod.relative(pathMod.dirname(vfile.path), PLUGIN_PATH),
      model: {
        include: opts['selector-include'] ?? '',
        exclude: opts['selector-exclude'] ?? '',
        options: tabulatorOpts,
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
