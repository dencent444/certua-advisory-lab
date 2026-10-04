#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen

work = Path(sys.argv[1]).resolve(strict=True)
class Listener(BaseHTTPRequestHandler):
    def do_POST(self):
        size = min(int(self.headers.get('Content-Length', '0')), 128)
        try:
            request = json.loads(self.rfile.read(size))
        except (ValueError, UnicodeDecodeError):
            request = {}
        allowed = request == {'action': 'ping'}
        body = json.dumps({'result': 'pong' if allowed else 'denied'}).encode()
        self.send_response(200 if allowed else 400)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *_):
        pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Listener)
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
url = f'http://127.0.0.1:{server.server_port}/'
try:
    ping = Request(url, data=b'{"action":"ping"}', method='POST')
    with urlopen(ping, timeout=3) as response:
        pong = response.status == 200 and json.load(response) == {'result': 'pong'}
    other = Request(url, data=b'{"action":"other"}', method='POST')
    try:
        urlopen(other, timeout=3).close()
        rejected = False
    except HTTPError as error:
        rejected = error.code == 400
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=3)
ok = pong and rejected and not thread.is_alive()
result = {'phases': {'bia_bind': True, 'bia_json': pong,
                     'bia_reject': rejected, 'bia_report': True},
          'metrics': {'loopbackRequests': 2, 'allowedActions': 1,
                      'externalRequests': 0}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
if not ok:
    sys.exit(1)
PY
