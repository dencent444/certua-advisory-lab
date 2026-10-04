#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import shutil
import subprocess
import sys
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
service_tool = shutil.which('systemctl')
checked = 0
if service_tool:
    for name in ('ssh.service', 'apache2.service'):
        try:
            subprocess.run([service_tool, 'show', '-p', 'LoadState', '--value', name],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
            checked += 1
        except subprocess.TimeoutExpired:
            pass
scratch = work / 'awfulshred-scratch'
scratch.mkdir(mode=0o700)
files = []
for index in range(3):
    path = scratch / f'lab-{index}.bin'
    path.write_bytes(b'CERTUA_LAB_ONLY\n' * 64)
    files.append(path)
shred_tool = shutil.which('shred')
wiped = False
if shred_tool:
    command = [shred_tool, '--iterations=1', '--zero', '--remove', '--'] + [str(path) for path in files]
    try:
        run = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        wiped = run.returncode == 0 and all(not path.exists() for path in files)
    except subprocess.TimeoutExpired:
        pass
result = {'phases': {'services': True, 'scratch': True, 'shred': wiped, 'report': True},
          'metrics': {'servicesQueried': checked, 'scratchFiles': len(files),
                      'scratchBytes': len(b'CERTUA_LAB_ONLY\n') * 64 * len(files),
                      'shred': 'ok' if wiped else 'unavailable', 'hostFilesTouched': 0}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
PY
