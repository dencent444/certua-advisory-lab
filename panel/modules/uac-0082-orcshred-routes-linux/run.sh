#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import ipaddress
import json
import subprocess
import sys
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
query = subprocess.run(['ip', '-4', 'route', 'show'], capture_output=True, text=True,
                       timeout=5, check=True)
routes = [line for line in query.stdout.splitlines() if line.strip()]
candidates = set()
for line in routes:
    first = line.split()[0]
    try:
        network = ipaddress.ip_network(first, strict=False)
    except ValueError:
        continue
    if network.is_loopback or network.is_multicast or network.is_link_local:
        continue
    for subnet in network.subnets(new_prefix=24) if network.prefixlen < 24 else [network.supernet(new_prefix=24) if network.prefixlen > 24 else network]:
        candidates.add(str(subnet))
        if len(candidates) >= 64:
            break
    if len(candidates) >= 64:
        break
result = {'phases': {'route_cmd': True, 'route_derive': True,
                     'route_bound': True, 'route_report': True},
          'metrics': {'routeLines': len(routes), 'candidate24s': len(candidates),
                      'candidateLimit': 64, 'networkProbes': 0}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
PY
