#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
paths = [work / 'synthetic' / 'boot' / 'kernel.img',
         work / 'synthetic' / 'home' / 'lab-user' / 'notes.txt',
         work / 'synthetic' / 'var' / 'log' / 'lab.log']
for path in paths:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('CERTUA_LAB_ONLY\n')
for path in paths:
    if work not in path.resolve().parents:
        raise RuntimeError('path escaped work directory')
run = subprocess.run(['rm', '-f', '--', *(str(path) for path in paths)],
                     capture_output=True, timeout=5)
removed = run.returncode == 0 and all(not path.exists() for path in paths)
result = {'phases': {'path_scratch': True, 'path_remove': run.returncode == 0,
                     'path_verify': removed, 'path_report': True},
          'metrics': {'scratchFiles': len(paths), 'removedFiles': len(paths) if removed else 0,
                      'hostFilesTouched': 0}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
if not removed:
    sys.exit(1)
PY
