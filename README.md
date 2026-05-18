# myst-tabulator

A MyST plugin that turns labeled MyST tables into interactive [tabulator.js](https://tabulator.info) tables - sortable headers, optional search, copy-to-clipboard, pagination, header filters, and a raw-options escape hatch for everything else.

## Install

Add to your `myst.yml`:

```yaml
project:
  plugins:
    - https://raw.githubusercontent.com/choldgraf/myst-tabulator/main/src/tabulator.mjs
```

## Usage

Label a normal MyST table and reference it with the `{tabulator}` directive:

````
:::{table} Scientific Python packages
:label: pkgs

| Package | Language | Description |
|---------|----------|-------------|
| pandas | Python | Data analysis |
| NumPy | Python | Numerical computing |
:::

:::{tabulator} pkgs
:search:
:::
````

See [`docs/index.md`](./docs/index.md) for the full option list and live demos.

## Local development

```sh
nox -s docs-live   # live server with examples
nox -s docs        # static build
```

The docs site loads `../src/tabulator.mjs` directly, so plugin edits are picked up on reload.

## Limitations

The labeled element must contain a parseable HTML `<table>`. Tabulator does not handle multi-row headers, `colspan`, or `rowspan` via its HTML import.
