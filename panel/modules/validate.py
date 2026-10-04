#!/usr/bin/env python3
"""Validate module contracts; --run executes flow-based modules in temporary dirs."""

import argparse
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ID = re.compile(r"[a-z0-9-]{1,64}\Z")
PHASE_ID = re.compile(r"[a-z0-9_-]{1,32}\Z")
REQUIRED = ("titleEn", "titleUk", "descriptionEn", "descriptionUk",
            "sourceUrl", "sourceLabel", "limitationsEn", "limitationsUk")


def validate_module(folder: Path, run: bool) -> None:
    manifest = json.loads((folder / "manifest.json").read_text())
    assert manifest["id"] == folder.name and ID.fullmatch(folder.name), folder
    assert manifest["clusterId"] == "UAC-" + folder.name.split("-")[1], folder
    assert manifest["platform"] == "linux", folder
    assert all(isinstance(manifest.get(key), str) and manifest[key].strip() for key in REQUIRED), folder
    assert manifest["sourceUrl"].startswith("https://"), folder
    requirements = manifest.get("requires", [])
    assert isinstance(requirements, list) and all(
        isinstance(command, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,32}", command)
        for command in requirements), folder
    subprocess.run(["bash", "-n", str(folder / "run.sh")], check=True)
    stages = manifest.get("flow")
    if not stages:
        print(f"{folder.name}: manifest and shell syntax OK (legacy chain)")
        return
    stage_ids = []
    for stage in stages:
        assert all(isinstance(stage.get(key), str) and stage[key].strip()
                   for key in ("id", "titleEn", "titleUk", "noteEn", "noteUk")), folder
        assert PHASE_ID.fullmatch(stage["id"]), folder
        stage_ids.append(stage["id"])
    assert len(stage_ids) == len(set(stage_ids)), folder
    if not run:
        print(f"{folder.name}: manifest and shell syntax OK")
        return
    missing = [command for command in requirements if shutil.which(command) is None]
    if missing:
        print(f"{folder.name}: local run skipped; missing {', '.join(missing)}")
        return
    with tempfile.TemporaryDirectory(prefix="certua-module-check-") as temporary:
        stage = folder / "stage.sh"
        stage_url = stage.resolve().as_uri() if stage.exists() else "file:///dev/null"
        process = subprocess.run(["bash", str(folder / "run.sh"), temporary, stage_url, ""],
                                 capture_output=True, text=True, timeout=35)
        assert process.returncode == 0, f"{folder.name}: {process.stderr[:300]}"
        result_path = Path(temporary) / "result.json"
        assert result_path.stat().st_size < 1500, folder
        result = json.loads(result_path.read_text())
        assert set(result["phases"]) == set(stage_ids), folder
        assert all(isinstance(value, bool) for value in result["phases"].values()), folder
        print(f"{folder.name}: local run OK; phases={result['phases']}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", action="store_true", help="execute flow-based modules locally")
    options = parser.parse_args()
    for folder in sorted(ROOT.glob("uac-*-linux")):
        if (folder / "manifest.json").is_file():
            validate_module(folder, options.run)


if __name__ == "__main__":
    main()
