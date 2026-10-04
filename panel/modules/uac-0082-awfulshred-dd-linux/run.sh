#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
scratch = work / 'dd-lab.bin'
scratch.write_bytes(b'CERTUA_LAB_ONLY\n' * 32768)
size = scratch.stat().st_size
command = ['dd', 'if=/dev/urandom', f'of={scratch}', 'bs=4096', 'count=128',
           'conv=notrunc', 'status=none']
run = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                     timeout=10, check=False)
verified = run.returncode == 0 and scratch.stat().st_size == size
result = {'phases': {'dd_scratch': True, 'dd_write': run.returncode == 0,
                     'dd_verify': verified, 'dd_report': True},
          'metrics': {'scratchBytes': size, 'overwrittenBytes': 4096 * 128 if verified else 0,
                      'blockDevicesWritten': 0}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
if not verified:
    sys.exit(1)
PY
