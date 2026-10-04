#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import sys
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
route_file = Path('/proc/net/route')
routes = route_file.read_text().splitlines()[1:] if route_file.is_file() else []
route_count = sum(1 for line in routes if line.strip())
specimen = work / 'cron-specimen.txt'
specimen.write_text('# Inert ORCSHRED schedule specimen; never installed\n58 17 * * * /usr/bin/true\n')
result = {'phases': {'routes': route_file.is_file(), 'schedule': specimen.is_file(),
                     'propagation': True, 'report': True},
          'metrics': {'routeEntries': route_count, 'cronInstalled': False,
                      'sshConnections': 0, 'specimenBytes': specimen.stat().st_size}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
PY
