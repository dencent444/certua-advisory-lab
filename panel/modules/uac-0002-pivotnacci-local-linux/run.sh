#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.request import Request, urlopen

work = Path(sys.argv[1]).resolve(strict=True)
class Agent(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(min(int(self.headers.get('Content-Length', '0')), 64))
        answer = b'LAB_PIVOT_PONG' if self.path == '/agent' and body == b'LAB_PIVOT_PING' else b'DENY'
        self.send_response(200 if answer != b'DENY' else 400)
        self.end_headers()
        self.wfile.write(answer)
    def log_message(self, *_):
        pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Agent)
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    request = Request(f'http://127.0.0.1:{server.server_port}/agent',
                      data=b'LAB_PIVOT_PING', method='POST')
    with urlopen(request, timeout=3) as response:
        ok = response.status == 200 and response.read(64) == b'LAB_PIVOT_PONG'
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=3)
result = {'phases': {'piv_bind': True, 'piv_http': ok,
                     'piv_close': not thread.is_alive(), 'piv_report': True},
          'metrics': {'loopbackRequests': 1, 'externalRequests': 0,
                      'listenerClosed': not thread.is_alive()}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
if not ok or thread.is_alive():
    sys.exit(1)
PY
