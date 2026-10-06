#!/usr/bin/env python3
"""Build a source-linked inventory of implemented UAC simulations."""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REFERENCE = {
    "statement": "CERT-UA tracked over 150 UAC threat clusters in 2025",
    "asOf": "2025",
    "sourceUrl": "https://cip.gov.ua/en/faqs/cyber-threat-overview-and-defense-strategies-in-2025-cert-ua-s-experience",
}


def build() -> dict:
    clusters: dict[str, dict] = {}
    for file in sorted(ROOT.glob("uac-*/manifest.json")):
        module = json.loads(file.read_text())
        cluster = clusters.setdefault(module["clusterId"], {
            "id": module["clusterId"], "sources": [], "modules": []})
        if module["sourceUrl"] not in cluster["sources"]:
            cluster["sources"].append(module["sourceUrl"])
        cluster["modules"].append(module["id"])
    return {
        "schemaVersion": 1,
        "reference": REFERENCE,
        "coverage": {"runnableScenarios": sum(len(row["modules"]) for row in clusters.values()),
                     "linuxScenarios": sum(1 for file in ROOT.glob("uac-*/manifest.json") if json.loads(file.read_text()).get("platform") == "linux"),
                     "windowsScenarios": sum(1 for file in ROOT.glob("uac-*/manifest.json") if json.loads(file.read_text()).get("platform") == "windows"),
                     "distinctUacIds": len(clusters)},
        "clusters": [clusters[key] for key in sorted(clusters)],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="update coverage.json")
    args = parser.parse_args()
    document = build()
    output = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        (ROOT / "coverage.json").write_text(output)
    else:
        print(output, end="")
