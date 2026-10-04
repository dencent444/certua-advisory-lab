#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" "$2" "${3:-}" <<'PY'
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
machine_id = Path('/etc/machine-id').read_text().strip() if Path('/etc/machine-id').is_file() else ''
key = hashlib.sha256(b'certua-biasboat-lab:' + machine_id.encode()).digest()
plain = b'INERT_BIASBOAT_LAB_BLOB'
blob = bytes(byte ^ key[index % len(key)] for index, byte in enumerate(plain))
(work / 'bound.blob').write_bytes(blob)
bound = bytes(byte ^ key[index % len(key)] for index, byte in enumerate((work / 'bound.blob').read_bytes())) == plain

command = ['curl', '--fail', '--silent', '--show-error', '--connect-timeout', '8', '--max-time', '20', '--noproxy', '']
if sys.argv[3]:
    command += ['--proxy', sys.argv[3]]
command += [sys.argv[2]]
request = subprocess.run(command, capture_output=True, timeout=25, check=False)
beacon = request.returncode == 0 and request.stdout == b'LAB_BIASBOAT_OK\n'
result = {'phases': {'binding': bound, 'profile': True, 'beacon': beacon, 'report': True},
          'metrics': {'os': os.uname().sysname, 'arch': os.uname().machine,
                      'labRequest': 'ok' if beacon else 'failed', 'blobBytes': len(blob)}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
if not beacon:
    sys.exit(1)
PY
