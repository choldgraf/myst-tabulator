# myst-tabulator

See [Jupyter outputs](jupyter.md) for live `{code-cell}` examples with pandas DataFrames.

## How to use it

Add the plugin to your `myst.yml`:

```yaml
project:
  plugins:
    - https://raw.githubusercontent.com/choldgraf/myst-tabulator/main/src/tabulator.mjs
```

Add the directive once per page and it will enhance **all HTML tables in the content section of the page**:

````
:::{tabulator}
:::
````

## Scoping

To only enhance subsets of HTML tables, use `:selector-include:` / `:selector-exclude:` options.
In this case, multiple `{tabulator}` directives can coexist on one page; each table is enhanced once (first match wins).

```
:::{tabulator}
:selector-include: .my-data table
:::
```

## What gets enhanced

Every `<table>` inside `article.article` or `main` — MyST tables, `{table}` directives, `{list-table}` outputs, and the HTML tables that pandas emits in code-cell outputs.

::::{myst:demo}
:::{tabulator}
:selector-include: .ex-basic table
:header-filter:
:::

:::{div}
:class: ex-basic

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
::::

## Pagination

Add `:pagination:` (and optionally `:page-size:`) for client-side pagination.

::::{myst:demo}
:::{tabulator}
:selector-include: .ex-paged table
:pagination:
:page-size: 5
:header-filter:
:::

:::{div}
:class: ex-paged

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
::::

## Copy to clipboard

Add `:copy:` to show a "Copy" button in the table footer.
It writes the currently visible rows (with headers, tab-separated) to the clipboard — paste-friendly for spreadsheets.
Tabulator's Ctrl+C shortcut works too when the table has focus.

::::{myst:demo}
:::{tabulator}
:selector-include: .ex-copy table
:copy:
:::

:::{div}
:class: ex-copy

| Package | Language | Description |
|---------|----------|-------------|
| pandas | Python | Data analysis |
| NumPy | Python | Numerical computing |
| SciPy | Python | Scientific computing |
| Polars | Rust/Python | Fast dataframes |
:::
::::

## Sorting numbers with units

Tabulator auto-detects column types from cell content.
Numbers formatted with a currency symbol (`$3.50`) or percent (`12%`) are detected as strings, so clicking the header sorts them alphabetically - try sorting the Price or Tax columns below.

::::{myst:demo}
:::{tabulator}
:selector-include: .ex-currency table
:::

:::{div}
:class: ex-currency

| Product | Price | Tax |
|---------|-------|-----|
| Apples | $0.99 | 5% |
| Bread | $3.50 | 0% |
| Milk | $4.25 | 5% |
| Eggs | $5.99 | 12% |
| Cheese | $12.00 | 8% |
| Olive oil | $24.50 | 8% |
:::
::::

## Raw Tabulator options

Pass any other Tabulator constructor option through `:tabulator-options:` as a one-line JSON string.

```
:::{tabulator}
:tabulator-options: {"movableColumns": true, "layout": "fitColumns"}
:::
```

## Option reference

| Option | Type | Effect |
|---|---|---|
| `:selector-include:` | CSS selector | Tables to enhance. Default: article-body tables. |
| `:selector-exclude:` | CSS selector | Tables to skip. |
| `:pagination:` | flag | Enable local pagination. |
| `:page-size: N` | number | Rows per page (with `:pagination:`). |
| `:header-filter:` | flag | Add a filter input under each column header. |
| `:copy:` | flag | Show a "Copy" button in the table footer. |
| `:layout: <mode>` | string | Tabulator layout (`fitColumns`, `fitData`, `fitDataFill`, …). |
| `:no-sort:` | flag | Disable click-to-sort on headers. |
| `:tabulator-options:` | JSON string | Merged into the Tabulator constructor (last-write-wins). |
