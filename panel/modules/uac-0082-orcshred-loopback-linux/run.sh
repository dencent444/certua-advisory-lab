#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import socket
import sys
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
ports = (22, 2468, 24687, 522)
open_count = 0
for port in ports:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
        connection.settimeout(0.2)
        open_count += connection.connect_ex(('127.0.0.1', port)) == 0
result = {'phases': {'probe_scope': True, 'probe_ports': True,
                     'probe_noauth': True, 'probe_report': True},
          'metrics': {'portsChecked': len(ports), 'loopbackOpen': open_count,
                      'authAttempts': 0, 'remoteHosts': 0}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
PY
