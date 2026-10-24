"""Run every row of claims.csv through the tracer. Needs internet and a model (or the regex fallback).
Add rows to claims.csv to grow the community test set. Verify each expected label against the source first."""
import csv
import sys

sys.path.insert(0, ".")
from tracer import trace  # noqa: E402

rows = list(csv.DictReader(open("claims.csv", newline="")))
passed = 0
for r in rows:
    got = trace(r["text"])["verdict"]["label"]
    ok = got == r["expected"]
    passed += ok
    print(("PASS" if ok else "FAIL"), "|", r["text"], "| expected", r["expected"], "| got", got)
print(f"\n{passed}/{len(rows)} passed")
sys.exit(0 if passed == len(rows) else 1)
