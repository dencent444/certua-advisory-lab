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
from urllib.request import Request, urlopen

work = Path(sys.argv[1]).resolve(strict=True)
site = work / 'vendor-app'
site.mkdir(mode=0o700)
endpoint = site / 'tunnel-check.php'
endpoint.write_text("<?php if(($_SERVER['HTTP_X_LAB_ACTION']??'')!=='FORWARD'){http_response_code(400);exit('DENY');} if(file_get_contents('php://input')!=='PING'){http_response_code(400);exit('DENY');} echo 'PONG'; ?>\n")
with socket.socket() as reservation:
    reservation.bind(('127.0.0.1', 0))
    port = reservation.getsockname()[1]
server = subprocess.Popen(['php', '-S', f'127.0.0.1:{port}', '-t', str(site)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
url = f'http://127.0.0.1:{port}/tunnel-check.php'
try:
    for _ in range(40):
        try:
            urlopen(url, timeout=1).close()
            break
        except HTTPError:
            break
        except URLError:
            time.sleep(0.1)
    request = Request(url, data=b'PING', headers={'X-Lab-Action': 'FORWARD'}, method='POST')
    with urlopen(request, timeout=3) as response:
        good = response.status == 200 and response.read(64) == b'PONG'
    bad_request = Request(url, data=b'OTHER', headers={'X-Lab-Action': 'FORWARD'}, method='POST')
    try:
        urlopen(bad_request, timeout=3).close()
        bad_rejected = False
    except HTTPError as error:
        bad_rejected = error.code == 400
finally:
    server.terminate()
    server.wait(timeout=5)
ok = good and bad_rejected
result = {'phases': {'reg_file': endpoint.is_file(), 'reg_listen': True,
                     'reg_post': ok, 'reg_report': True},
          'metrics': {'phpBytes': endpoint.stat().st_size, 'fixedExchange': ok,
                      'externalRequests': 0}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
if not ok:
    sys.exit(1)
PY
