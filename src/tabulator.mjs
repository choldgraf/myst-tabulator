/**
 * MyST plugin + anywidget module for tabulator.
 *
 * Single file, two roles:
 *   1. MyST plugin (Node, build-time) - defines the {tabulator} directive
 *   2. anywidget ESM (browser, page-load) - renders the interactive table
 *
 * At build time the directive emits an `anywidget` node carrying the target
 * label and a Tabulator options blob. At render time the widget deep-clones
 * the labeled element into its shadow-DOM container, hides the original, and
 * runs Tabulator on the clone - keeping all DOM mutation inside a React-safe
 * island.
 */

// Dynamic import (not static) because this file is also evaluated in the
// browser, where `node:path` can't be resolved.
let pathMod;
try { pathMod = await import('node:path'); } catch {}
const PLUGIN_PATH = new URL(import.meta.url).pathname;

const TABULATOR_VERSION = '6.3.1';
// `tabulator_simple` is the most neutral theme Tabulator ships - thin borders,
// no gradients - which sits well next to MyST's Tailwind chrome.
const TABULATOR_CSS_URL = `https://cdn.jsdelivr.net/npm/tabulator-tables@${TABULATOR_VERSION}/dist/css/tabulator_simple.min.css`;
const TABULATOR_ESM_URL = `https://cdn.jsdelivr.net/npm/tabulator-tables@${TABULATOR_VERSION}/+esm`;

// Map MyST-flavored directive options into a Tabulator constructor options
// object. `extra` (parsed `:tabulator-options:` JSON) is merged last so power
// users can override anything we set by default.
function buildOptions(directiveOptions, extra) {
  const opts = {};
  const colDefaults = {};

  if (directiveOptions.pagination) opts.pagination = 'local';
  if (typeof directiveOptions['page-size'] === 'number') {
    opts.paginationSize = directiveOptions['page-size'];
  }
  if (directiveOptions['header-filter']) colDefaults.headerFilter = 'input';
  if (directiveOptions['no-sort']) colDefaults.headerSort = false;
  if (directiveOptions.layout) opts.layout = directiveOptions.layout;
  if (directiveOptions.copy) {
    opts.clipboard = 'copy';
    opts.clipboardCopyRowRange = 'active';
    opts.clipboardCopyConfig = { columnHeaders: true };
  }
  if (Object.keys(colDefaults).length > 0) opts.columnDefaults = colDefaults;
  if (extra) Object.assign(opts, extra);

  return opts;
}

function inlineError(el, message) {
  const div = document.createElement('div');
  div.style.cssText =
    'color:#a00;padding:0.4rem 0.6rem;font-size:0.9rem;border:1px solid #fcc;border-radius:4px;background:#fff5f5;';
  div.textContent = `tabulator: ${message}`;
  el.appendChild(div);
}

async function render({ model, el }) {
  const tableId = (model.get('tableId') ?? '').trim();
  const rawOptions = { ...(model.get('options') || {}) };
  const showSearch = !!model.get('search');
  const showCopy = !!model.get('copy');

  // Reset the UA-default figure margin so toolbar controls align with the
  // table's left edge. Page CSS can't cross the shadow boundary, but the
  // browser default (margin: 1em 40px) still applies.
  const style = document.createElement('style');
  style.textContent = 'figure{margin:0;}';
  el.appendChild(style);

  if (!tableId) {
    inlineError(el, 'missing target id - write `:::{tabulator} my-label :::`');
    return;
  }

  const orig = document.getElementById(tableId);
  if (!orig) {
    inlineError(el, `no element with id "${tableId}" on the page`);
    return;
  }

  // Deep-clone into our shadow-DOM-safe container; React keeps owning the
  // original node. Force `display:''` so a clone made after an earlier widget
  // already hid the original isn't blank.
  const clone = orig.cloneNode(true);
  clone.removeAttribute('id');
  clone.style.display = '';
  orig.style.display = 'none';

  const tableEl =
    clone.tagName === 'TABLE' ? clone : clone.querySelector('table');
  if (!tableEl) {
    inlineError(el, `no <table> found inside #${tableId}`);
    return;
  }

  // Toolbar (built first so the layout doesn't jump when Tabulator loads).
  let searchInput, copyButton;
  if (showSearch || showCopy) {
    const toolbar = document.createElement('div');
    toolbar.style.cssText =
      'display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin:0 0 0.5rem 0;';

    if (showSearch) {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'flex:0 1 24rem;position:relative;';
      searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.placeholder = 'Search…';
      searchInput.style.cssText =
        'width:100%;padding:0.4rem 0.6rem;font-size:0.9rem;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;';
      wrapper.appendChild(searchInput);
      toolbar.appendChild(wrapper);
    }

    if (showCopy) {
      copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.textContent = 'Copy';
      copyButton.style.cssText =
        'padding:0.4rem 0.8rem;font-size:0.9rem;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;';
      toolbar.appendChild(copyButton);
    }

    el.appendChild(toolbar);
  }
  el.appendChild(clone);

  let mod;
  try {
    mod = await import(TABULATOR_ESM_URL);
  } catch (err) {
    inlineError(el, `failed to load Tabulator - ${err.message}`);
    return;
  }

  let t;
  try {
    t = new mod.TabulatorFull(tableEl, rawOptions);
  } catch (err) {
    inlineError(el, `Tabulator init failed - ${err.message}`);
    return;
  }

  if (showSearch) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) return t.clearFilter();
      t.setFilter((row) =>
        Object.values(row).some(
          (v) => v != null && String(v).toLowerCase().includes(q),
        ),
      );
    });
  }

  if (showCopy) {
    const original = copyButton.textContent;
    let resetTimer;
    copyButton.addEventListener('click', async () => {
      clearTimeout(resetTimer);
      try {
        await t.copyToClipboard();
        copyButton.textContent = 'Copied!';
      } catch {
        copyButton.textContent = 'Copy failed';
      }
      resetTimer = setTimeout(() => {
        copyButton.textContent = original;
      }, 1500);
    });
  }
}

const tabulatorDirective = {
  name: 'tabulator',
  doc: 'Render a labeled MyST table as an interactive Tabulator table.',
  arg: {
    type: String,
    doc: 'The label of the table to enhance (the `:label:` on a `{table}` directive). A leading `#` is stripped.',
  },
  options: {
    pagination: { type: Boolean, doc: 'Enable local pagination.' },
    'page-size': { type: Number, doc: 'Rows per page when pagination is enabled.' },
    'header-filter': { type: Boolean, doc: 'Add a filter input under each column header.' },
    layout: { type: String, doc: 'Tabulator layout mode (e.g. fitColumns, fitData, fitDataFill).' },
    search: { type: Boolean, doc: 'Show a global search input above the table that filters across all columns.' },
    copy: { type: Boolean, doc: 'Show a "Copy" button that copies the currently visible rows (with headers) to the clipboard.' },
    'no-sort': { type: Boolean, doc: 'Disable click-to-sort on column headers.' },
    'tabulator-options': {
      type: String,
      doc: 'Raw JSON merged into the Tabulator constructor options (last-write-wins over named options).',
    },
  },
  run(data, vfile) {
    const arg = (data.arg ?? '').trim().replace(/^#/, '');
    const directiveOptions = data.options ?? {};

    let extra;
    const raw = directiveOptions['tabulator-options'];
    if (raw && raw.trim()) {
      try {
        extra = JSON.parse(raw);
      } catch (err) {
        vfile.message(
          `tabulator: could not parse :tabulator-options: as JSON - ${err.message}`,
        );
      }
    }

    return [{
      type: 'anywidget',
      esm: pathMod.relative(pathMod.dirname(vfile.path), PLUGIN_PATH),
      css: TABULATOR_CSS_URL,
      model: {
        tableId: arg,
        options: buildOptions(directiveOptions, extra),
        search: !!directiveOptions.search,
        copy: !!directiveOptions.copy,
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
