#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import json
import os
import random
import socket
import subprocess
import sys
import time
import uuid
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

start_stage('routes')
routes = Path('/proc/net/route')
route_count = sum(bool(line.strip()) for line in routes.read_text().splitlines()[1:]) if routes.exists() else 0
ssh_probe = False
try:
    with socket.create_connection(('127.0.0.1', 22), timeout=.5): ssh_probe = True
except OSError: pass
finish_stage('routes', routes.exists())

service_unit = f'certua-lab-http-{os.getpid()}'
schedule = False
services = False
def call(*args):
    try:
        return subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False
def cron(*args, input_text=None):
    try:
        return subprocess.run(['crontab', *args], input=input_text, capture_output=True,
                              text=True, timeout=8)
    except (OSError, subprocess.TimeoutExpired):
        return subprocess.CompletedProcess(['crontab', *args], 124, '', 'unavailable')
cron_cleaned = True
start_stage('schedule')
try:
    # A marked user cron entry is removed immediately, even if the next stage fails.
    marker = 'CERTUA-LAB-' + uuid.uuid4().hex
    current = cron('-l')
    if current.returncode == 0 or (current.returncode == 1 and 'no crontab' in current.stderr.lower()):
        existing = current.stdout if current.returncode == 0 else ''
        entry = f'59 23 * * * /usr/bin/true # {marker}\n'
        added = cron('-', input_text=existing.rstrip('\n') + '\n' + entry).returncode == 0
        if added:
            shown = cron('-l')
            schedule = shown.returncode == 0 and marker in shown.stdout
finally:
    if 'marker' in locals():
        latest = cron('-l')
        if latest.returncode == 0 and marker in latest.stdout:
            retained = ''.join(line for line in latest.stdout.splitlines(keepends=True) if marker not in line)
            if retained.strip():
                cron('-', input_text=retained)
            else:
                call('crontab', '-r')
        remaining = cron('-l')
        cron_cleaned = remaining.returncode in (0, 1) and marker not in remaining.stdout
schedule = schedule and cron_cleaned
finish_stage('schedule', schedule)

start_stage('services')
try:
    listener = socket.socket()
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
    listener.close()
    started = call('systemd-run', '--user', '--unit', service_unit,
                   sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1',
                   '--directory', str(work))
    if started:
        services = call('systemctl', '--user', 'stop', service_unit + '.service')
finally:
    call('systemctl', '--user', 'stop', service_unit + '.service')
    call('systemctl', '--user', 'reset-failed', service_unit + '.service')
finish_stage('services', services)

start_stage('wipe')
tree = work / 'awfulshred-decoys'
files = []
for folder in ('boot', 'home', 'var-log'):
    directory = tree / folder
    directory.mkdir(parents=True, mode=0o700)
    path = directory / 'lab.bin'
    path.write_bytes(b'CERTUA_LAB_OWNED\n' * 128)
    files.append(path)
wiped = call('shred', '--iterations=1', '--zero', '--remove', '--', *map(str, files))
wiped = wiped and all(not path.exists() for path in files)
finish_stage('wipe', wiped)
result = {'phases': {'routes': routes.exists(), 'schedule': schedule,
                     'services': services, 'wipe': wiped},
          'metrics': {'routeEntries': route_count, 'loopbackSshReachable': ssh_probe,
                      'cronCreatedAndRemoved': schedule, 'cronLeftBehind': not cron_cleaned,
                      'ownHttpServiceStopped': services,
                      'decoyFilesWiped': len(files) if wiped else 0, 'hostFilesTouched': 0},
          'timeline': [json.loads(line) for line in (work / 'timing.jsonl').read_text().splitlines()]}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
if not all(result['phases'].values()): sys.exit(1)
PY
