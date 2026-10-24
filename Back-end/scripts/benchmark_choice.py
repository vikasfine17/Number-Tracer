"""Benchmark similarity-only indicator choice versus Gemma indicator choice.
Reports similarity-only accuracy vs Gemma accuracy using choice_claims.csv.
"""
import csv
import sys
from pathlib import Path

# Support running from root or Back-end or scripts directory
script_dir = Path(__file__).resolve().parent
project_root = script_dir.parent if script_dir.name == "scripts" else script_dir
backend_dir = project_root / "Back-end" if (project_root / "Back-end").exists() else project_root
sys.path.insert(0, str(backend_dir))

from tracer.choose import choose_indicator  # noqa: E402
from tracer.extract import extract  # noqa: E402
from tracer.sources import load_sources  # noqa: E402


def find_source(sources, name):
    name_clean = name.strip().lower()
    for s in sources:
        if s.name.strip().lower() == name_clean:
            return s
    return None


def run_benchmark(csv_path="choice_claims.csv"):
    path = Path(csv_path)
    if not path.exists():
        alt = backend_dir / csv_path
        if alt.exists():
            path = alt
        else:
            print(f"Error: Could not find {csv_path}")
            sys.exit(1)

    with open(path, mode="r", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r.get("claim") and r["claim"].strip() and not r["claim"].startswith("#")]

    if not rows:
        print(f"No valid rows found in {path}")
        return

    sources = load_sources()
    sim_correct = 0
    gemma_correct = 0
    total = len(rows)

    print(f"\nRunning benchmark on {total} claims from {path.name}...\n")
    print(f"{'#':<3} {'Source':<20} {'Similarity':<14} {'Gemma':<14} {'Expected':<18} Claim")
    print("-" * 90)

    for i, r in enumerate(rows, start=1):
        claim_text = r["claim"].strip()
        src_name = r.get("source", "World Bank WDI").strip()
        expected_id = r.get("correct_indicator_id", "").strip()

        source_obj = find_source(sources, src_name)
        if not source_obj:
            print(f"{i:<3} {src_name:<20} [Source not found] {claim_text}")
            continue

        claim = extract(claim_text)
        if not claim:
            print(f"{i:<3} {src_name:<20} [Extraction failed] {claim_text}")
            continue

        mod = sys.modules[source_obj.__class__.__module__]
        if hasattr(mod, "rank"):
            ranked = mod.rank(claim.metric, top=5)
        else:
            ranked = []

        if not ranked:
            print(f"{i:<3} {src_name:<20} [No candidates] {claim_text}")
            continue

        candidates = [
            {"id": ind["id"], "name": ind["name"], "definition": (ind.get("note") or "")[:300]}
            for score, ind in ranked
        ]

        # Top-1 Similarity Choice
        sim_choice_id = ranked[0][1]["id"]
        sim_ok = (sim_choice_id.lower() == expected_id.lower())
        sim_correct += int(sim_ok)

        # Gemma Choice
        idx, conf, reason, chosen_by = choose_indicator(claim, candidates, source=source_obj.name)
        gemma_choice_id = ranked[idx][1]["id"] if idx is not None else None
        gemma_ok = (gemma_choice_id is not None and gemma_choice_id.lower() == expected_id.lower())
        gemma_correct += int(gemma_ok)

        sim_status = "✓ OK" if sim_ok else f"✗ {sim_choice_id[:10]}"
        gemma_status = "✓ OK" if gemma_ok else (f"✗ {gemma_choice_id[:10]}" if gemma_choice_id else "✗ null")

        print(f"{i:<3} {src_name:<20} {sim_status:<14} {gemma_status:<14} {expected_id:<18} {claim_text[:35]}")

    print("-" * 90)
    sim_pct = (sim_correct / total) * 100 if total else 0
    gemma_pct = (gemma_correct / total) * 100 if total else 0
    print(f"Similarity-only accuracy : {sim_correct}/{total} ({sim_pct:.1f}%)")
    print(f"Gemma accuracy           : {gemma_correct}/{total} ({gemma_pct:.1f}%)")
    diff = gemma_pct - sim_pct
    prefix = "+" if diff >= 0 else ""
    print(f"Accuracy improvement     : {prefix}{diff:.1f} percentage points\n")


if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "choice_claims.csv"
    run_benchmark(csv_file)
