# myst-tabulator

Turn any labeled MyST table into an interactive, sortable, searchable one powered by [tabulator.js](https://tabulator.info).

## How to use it

Add the plugin to your `myst.yml`:

```yaml
project:
  plugins:
    - https://raw.githubusercontent.com/choldgraf/myst-tabulator/main/src/tabulator.mjs
```

Label a MyST table and drop `:::{tabulator} <label> :::` wherever you want the interactive version - the original renders normally without JavaScript and is hidden when JavaScript is on.

## Minimal example

The default behavior gives you click-to-sort headers. Add `:search:` to opt into a global search input that filters across all columns.

::::{myst:demo}
:::{table}
:label: pkgs-minimal

| Package | Language | Description |
|---------|----------|-------------|
| pandas | Python | Data analysis and manipulation |
| NumPy | Python | Numerical computing |
| SciPy | Python | Scientific computing |
| Matplotlib | Python | Plotting |
| scikit-learn | Python | Machine learning |
| Polars | Rust/Python | Fast dataframes |
| Dask | Python | Parallel computing |
| Xarray | Python | Labeled N-d arrays |
:::

:::{tabulator} pkgs-minimal
:search:
:::
::::

## With pagination

Pass `:pagination:` and (optionally) `:page-size:` to enable client-side pagination.

::::{myst:demo}
:::{table} A longer table
:label: pkgs-paginated

| Package | Language | Description |
|---------|----------|-------------|
| pandas | Python | Data analysis |
| NumPy | Python | Numerical computing |
| SciPy | Python | Scientific computing |
| Matplotlib | Python | Plotting |
| scikit-learn | Python | Machine learning |
| Polars | Rust/Python | Fast dataframes |
| Dask | Python | Parallel computing |
| seaborn | Python | Statistical visualization |
| Plotly | Python | Interactive plotting |
| Altair | Python | Grammar-of-graphics |
:::

:::{tabulator} pkgs-paginated
:pagination:
:page-size: 5
:search:
:::
::::

## With per-column header filters

`:header-filter:` puts an input below each column header that filters that column independently. Use it instead of `:search:` when you want column-specific filtering.

::::{myst:demo}
:::{tabulator} pkgs-minimal
:header-filter:
:::
::::

## Copy to clipboard

Add `:copy:` to expose a "Copy" button that writes the currently visible rows (after any search/filter) to the clipboard, with column headers, as tab-separated values - paste-friendly for spreadsheets.

::::{myst:demo}
:::{tabulator} pkgs-minimal
:search:
:copy:
:::
::::

## Raw Tabulator options

Anything not exposed as a named option can be passed verbatim through `:tabulator-options:` as a JSON string (one line). Power-user features (column grouping, movable columns, frozen columns, custom formatters, …) live here.

::::{myst:demo}
:::{tabulator} pkgs-minimal
:tabulator-options: {"movableColumns": true, "layout": "fitColumns"}
:::
::::

## Option reference

| Option | Type | Effect |
|---|---|---|
| `:pagination:` | flag | Enable local pagination. |
| `:page-size: N` | number | Rows per page (with `:pagination:`). |
| `:header-filter:` | flag | Add a filter input under each column header. |
| `:layout: <mode>` | string | Tabulator layout (`fitColumns`, `fitData`, `fitDataFill`, …). |
| `:search:` | flag | Show a global search input above the table. |
| `:copy:` | flag | Show a "Copy" button. |
| `:no-sort:` | flag | Disable click-to-sort on headers. |
| `:tabulator-options:` | JSON string | Merged into the Tabulator constructor (last-write-wins). |
