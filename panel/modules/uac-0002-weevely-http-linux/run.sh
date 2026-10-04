#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

work = Path(sys.argv[1]).resolve(strict=True)
site = work / 'vendor-app'
site.mkdir(mode=0o700)
endpoint = site / 'status.php'
endpoint.write_text("<?php $k=$_POST['k']??''; if(!hash_equals('CERTUA_LAB',$k)){http_response_code(403);exit('DENY');} echo 'LAB_OK'; ?>\n")
with socket.socket() as reservation:
    reservation.bind(('127.0.0.1', 0))
    port = reservation.getsockname()[1]
server = subprocess.Popen(['php', '-S', f'127.0.0.1:{port}', '-t', str(site)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
url = f'http://127.0.0.1:{port}/status.php'
try:
    for _ in range(40):
        try:
            urlopen(url, timeout=1).close()
            break
        except HTTPError:
            break
        except URLError:
            time.sleep(0.1)
    def post(key):
        request = Request(url, data=urlencode({'k': key}).encode(), method='POST')
        try:
            with urlopen(request, timeout=3) as response:
                return response.status, response.read(64)
        except HTTPError as error:
            return error.code, error.read(64)
    denied = post('wrong')
    allowed = post('CERTUA_LAB')
finally:
    server.terminate()
    server.wait(timeout=5)
ok = denied == (403, b'DENY') and allowed == (200, b'LAB_OK')
result = {'phases': {'wee_file': endpoint.is_file(), 'wee_listen': True,
                     'wee_post': ok, 'wee_report': True},
          'metrics': {'phpBytes': endpoint.stat().st_size, 'deniedStatus': denied[0],
                      'allowedStatus': allowed[0], 'externalRequests': 0}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
if not ok:
    sys.exit(1)
PY
