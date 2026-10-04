#!/usr/bin/env bash
set -euo pipefail
python3 - "$1" <<'PY'
import ctypes
import hashlib
import json
import os
import signal
import sys
from pathlib import Path

work = Path(sys.argv[1]).resolve(strict=True)
machine_id = Path('/etc/machine-id').read_text().strip() if Path('/etc/machine-id').is_file() else ''
host_key = hashlib.sha256(b'certua-loadgrip-lab:' + machine_id.encode()).digest()
marker = b'INERT_LOADGRIP_LAB_STAGE'
blob = bytes(byte ^ host_key[index % len(host_key)] for index, byte in enumerate(marker))
(work / 'host-bound.blob').write_bytes(blob)
reopened = (work / 'host-bound.blob').read_bytes()
bound_ok = bytes(byte ^ host_key[index % len(host_key)] for index, byte in enumerate(reopened)) == marker

ptrace_ok = False
ptrace_state = 'unavailable'
pid = None
reaped = False
try:
    libc = ctypes.CDLL(None, use_errno=True)
    libc.ptrace.restype = ctypes.c_long
    pid = os.fork()
    if pid == 0:
        if libc.ptrace(0, 0, 0, 0) == -1:  # PTRACE_TRACEME, own child only
            os._exit(77)
        os.kill(os.getpid(), signal.SIGSTOP)
        os._exit(0)
    _, status = os.waitpid(pid, os.WUNTRACED)
    reaped = os.WIFEXITED(status) or os.WIFSIGNALED(status)
    if os.WIFSTOPPED(status):
        continued = libc.ptrace(7, pid, 0, 0) == 0  # PTRACE_CONT; no memory writes
        if continued:
            _, status = os.waitpid(pid, 0)
            reaped = True
            ptrace_ok = os.WIFEXITED(status) and os.WEXITSTATUS(status) == 0
        ptrace_state = 'observed' if ptrace_ok else 'blocked'
    else:
        ptrace_state = 'blocked'
except (OSError, AttributeError) as exc:
    ptrace_state = type(exc).__name__
finally:
    if pid and pid > 0 and not reaped:
        try:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        except (ProcessLookupError, ChildProcessError):
            pass

result = {'phases': {'machine': bool(machine_id), 'payload': bound_ok,
                     'ptrace': ptrace_ok, 'report': True},
          'metrics': {'machineIdPresent': bool(machine_id), 'blobBytes': len(blob),
                      'ptrace': ptrace_state}}
(work / 'result.json').write_text(json.dumps(result, separators=(',', ':')))
PY
