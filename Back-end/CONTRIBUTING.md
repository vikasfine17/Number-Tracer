# Contributing

Number Tracer is MIT licensed. Two easy ways to help:

1. **Add a data source.** Create a file in `tracer/sources/` with a subclass of `Source`
   (see `base.py`). It is discovered automatically. Good first issues: Eurostat, data.gov.in, OECD, a state open-data portal.
2. **Add test claims.** Add a row to `claims.csv` with the claim and the expected verdict
   (`matches`, `outdated`, `doesnt_match` or `cant_verify`). Check the expected label against the original source first.

Before opening a pull request run `pytest` and, if you have internet, `python scripts/benchmark.py`.
Verdicts must come from code that compares numbers. Models may only read the claim, never decide the verdict.
