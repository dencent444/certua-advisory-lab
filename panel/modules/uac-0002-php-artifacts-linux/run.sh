#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import shutil
import subprocess
import sys
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
site = work / 'vendor-app'
site.mkdir(mode=0o700)
artifact = site / 'health-check.php'
artifact.write_text("<?php echo 'CERTUA_LAB_OK'; ?>\n")
php = shutil.which('php')
syntax = False
response = False
if php:
    check = subprocess.run([php, '-l', str(artifact)], capture_output=True, timeout=10)
    syntax = check.returncode == 0
    if syntax:
        run = subprocess.run([php, str(artifact)], capture_output=True, timeout=10)
        response = run.returncode == 0 and run.stdout.strip() == b'CERTUA_LAB_OK'
result = {'phases': {'placement': artifact.is_file(), 'syntax': syntax,
                     'response': response, 'report': True},
          'metrics': {'phpCli': bool(php), 'artifactBytes': artifact.stat().st_size,
                      'localResponse': 'ok' if response else 'unavailable'}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
PY
