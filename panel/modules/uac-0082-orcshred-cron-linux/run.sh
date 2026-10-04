#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
before = subprocess.run(['crontab', '-l'], capture_output=True, timeout=5)
specimen = work / 'not-installed.cron'
specimen.write_text('# ORCSHRED lab specimen; not installed\n58 17 * * * /usr/bin/true\n')
after = subprocess.run(['crontab', '-l'], capture_output=True, timeout=5)
unchanged = before.returncode == after.returncode and before.stdout == after.stdout
result = {'phases': {'cron_read': True, 'cron_specimen': specimen.is_file(),
                     'cron_verify': unchanged, 'cron_report': True},
          'metrics': {'existingCrontab': before.returncode == 0,
                      'cronChanged': not unchanged, 'specimenBytes': specimen.stat().st_size}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
if not unchanged:
    sys.exit(1)
PY
