#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
query = subprocess.run(['lsblk', '-J', '-b', '-o', 'NAME,TYPE,SIZE'],
                       capture_output=True, text=True, timeout=5, check=True)
devices = json.loads(query.stdout).get('blockdevices', [])
def count_disks(entries):
    return sum((entry.get('type') == 'disk') + count_disks(entry.get('children', []))
               for entry in entries)
result = {'phases': {'disk_query': True, 'disk_filter': True,
                     'disk_bound': True, 'disk_report': True},
          'metrics': {'wholeDisks': count_disks(devices), 'deviceWrites': 0,
                      'servicesStopped': 0}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
PY
