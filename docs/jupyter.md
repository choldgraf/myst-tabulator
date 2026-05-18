---
kernelspec:
  name: python3
  display_name: Python 3
---

# Jupyter outputs

Pandas DataFrame outputs render as HTML tables, so Tabulator enhances them automatically.
This page needs `--execute` (or a configured Jupyter kernel) to show rendered outputs.

::::{myst:demo}
:::{tabulator}
:header-filter:
:copy:
:::
::::

## A simple DataFrame

::::{myst:demo}
```{code-cell} python3
import pandas as pd

pd.DataFrame({
    "package": ["pandas", "NumPy", "SciPy", "Matplotlib", "scikit-learn", "Polars", "Dask", "seaborn", "Plotly", "Altair"],
    "language": ["Python"] * 10,
    "category": ["data", "array", "scientific", "plot", "ml", "data", "parallel", "plot", "plot", "plot"],
    "stars_k": [42, 27, 12, 19, 58, 28, 12, 12, 16, 9],
})
```
::::

## describe()

::::{myst:demo}
```{code-cell} python3
import numpy as np
rng = np.random.default_rng(0)
pd.DataFrame({
    "speed": rng.normal(50, 8, 200),
    "altitude": rng.normal(1000, 120, 200),
    "temperature": rng.normal(15, 4, 200),
}).describe()
```
::::

## groupby + aggregation

::::{myst:demo}
```{code-cell} python3
df = pd.DataFrame({
    "country": ["FR", "FR", "DE", "DE", "IT", "IT", "ES", "ES", "PT", "PT"],
    "year": [2022, 2023, 2022, 2023, 2022, 2023, 2022, 2023, 2022, 2023],
    "gdp_growth": [2.5, 0.8, 1.8, -0.3, 3.7, 0.9, 5.5, 2.4, 6.7, 2.3],
})
df.groupby("country", as_index=False)["gdp_growth"].agg(["mean", "min", "max"])
```
::::

## df.to_html()

::::{myst:demo}
```{code-cell} python3
from IPython.display import HTML
HTML(pd.DataFrame({
    "country": ["France", "Germany", "Italy", "Spain"],
    "capital": ["Paris", "Berlin", "Rome", "Madrid"],
    "population_M": [67.5, 83.2, 58.9, 47.4],
}).to_html(index=False))
```
::::
