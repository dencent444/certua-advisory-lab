#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" "$2" "${3:-}" <<'PY'
import ctypes
import hashlib
import http.client
import json
import os
import random
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
timers = {}

def start_stage(name):
    delay = random.SystemRandom().randrange(800, 3001)
    time.sleep(delay / 1000)
    timers[name] = (time.monotonic_ns(), delay)

def finish_stage(name, ok):
    started, delay = timers.pop(name)
    entry = {'stage': name, 'at': int(time.time_ns() / 1000000),
             'durationMs': int((time.monotonic_ns() - started) / 1000000),
             'delayMs': delay, 'ok': bool(ok)}
    with (work / 'timing.jsonl').open('a') as output:
        output.write(json.dumps(entry, separators=(',', ':')) + '\n')

start_stage('binding')
machine = Path('/etc/machine-id').read_text().strip() if Path('/etc/machine-id').is_file() else ''
key = hashlib.sha256(b'certua-uac0002-lab:' + machine.encode()).digest()
marker = b'INERT_LOADGRIP_STAGE'
blob = bytes(byte ^ key[i % len(key)] for i, byte in enumerate(marker))
bound = work / 'host-bound.blob'
bound.write_bytes(blob)
binding = bool(machine) and bytes(byte ^ key[i % len(key)] for i, byte in enumerate(bound.read_bytes())) == marker
finish_stage('binding', binding)

start_stage('inject')
ptrace = False
pid = None
reaped = False
try:
    libc = ctypes.CDLL(None, use_errno=True)
    libc.ptrace.restype = ctypes.c_long
    pid = os.fork()
    if pid == 0:
        if libc.ptrace(0, 0, 0, 0) == -1: os._exit(77)
        os.kill(os.getpid(), signal.SIGSTOP)
        os._exit(0)
    _, status = os.waitpid(pid, os.WUNTRACED)
    if os.WIFSTOPPED(status):
        if libc.ptrace(7, pid, 0, 0) == 0:
            _, status = os.waitpid(pid, 0)
            reaped = True
            ptrace = os.WIFEXITED(status) and os.WEXITSTATUS(status) == 0
    else:
        reaped = True
finally:
    if pid and not reaped:
        try:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        except (ProcessLookupError, ChildProcessError): pass
finish_stage('inject', ptrace)

start_stage('web')
site = work / 'industrial-app'
site.mkdir(mode=0o700)
(site / 'health.php').write_text("<?php header('Content-Type: text/plain'); echo 'LAB_PHP_OK'; ?>\n")
sock = socket.socket()
sock.bind(('127.0.0.1', 0))
port = sock.getsockname()[1]
sock.close()
php = subprocess.Popen(['php', '-S', f'127.0.0.1:{port}', '-t', str(site)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
web = False
try:
    for _ in range(25):
        if php.poll() is not None: break
        try:
            conn = http.client.HTTPConnection('127.0.0.1', port, timeout=1)
            conn.request('GET', '/health.php')
            response = conn.getresponse()
            web = response.status == 200 and response.read() == b'LAB_PHP_OK'
            conn.close()
            break
        except OSError:
            time.sleep(.1)
finally:
    php.terminate()
    try: php.wait(timeout=3)
    except subprocess.TimeoutExpired: php.kill(); php.wait()
finish_stage('web', web)

start_stage('tunnel')
cmd = ['curl', '--fail', '--silent', '--show-error', '--connect-timeout', '8', '--max-time', '15', '--noproxy', '']
if sys.argv[3]: cmd += ['--proxy', sys.argv[3]]
cmd += [sys.argv[2]]
request = subprocess.run(cmd, capture_output=True, timeout=20)
tunnel = request.returncode == 0 and request.stdout.strip() == b'LAB_UAC_0002_OK'
finish_stage('tunnel', tunnel)
result = {'phases': {'binding': binding, 'inject': ptrace, 'web': web, 'tunnel': tunnel},
          'metrics': {'blobBytes': len(blob), 'ptrace': ptrace, 'phpLoopback': web,
                      'privateRequest': tunnel, 'foreignProcessesTouched': 0},
          'timeline': [json.loads(line) for line in (work / 'timing.jsonl').read_text().splitlines()]}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
if not all(result['phases'].values()): sys.exit(1)
PY
