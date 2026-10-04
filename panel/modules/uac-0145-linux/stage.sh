#!/usr/bin/env bash
set -euo pipefail
work_dir="$1"
python3 - "$work_dir" <<'PY'
import json
import os
import stat
import sys
import time

start = time.monotonic()
roots = ['/home', os.path.expanduser('~'), '/etc', '/srv', '/opt', '/mnt', '/media',
         '/data', '/var', '/root', '/tmp', '/run/user', '/dev/shm', '/usr/local', '/']
roots = list(dict.fromkeys(root for root in roots if os.path.isdir(root)))
virtual_roots = {'/proc', '/sys', '/dev', '/run'}
categories = {name: {'files': 0, 'bytes': 0} for name in
              ('credentials', 'messengers', 'browsers', 'documents', 'source', 'other')}
documents = {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods', '.ppt', '.pptx',
             '.txt', '.csv', '.rtf', '.zip', '.7z', '.tar', '.gz', '.db', '.sqlite'}
source = {'.py', '.js', '.ts', '.go', '.cpp', '.c', '.h', '.java', '.rs', '.sh', '.sql'}
secret_names = {'.env', '.npmrc', '.pypirc', '.git-credentials', 'credentials',
                'id_rsa', 'id_ed25519', 'wg-private'}
count = 0
total_bytes = 0
errors = 0
truncated = False
seen_dirs = set()

def category(path):
    value = path.lower().replace('\\', '/')
    name = os.path.basename(value)
    if (any(token in value for token in ('/.ssh/', '/.gnupg/', '/.aws/', '/.azure/',
                                          '/.kube/', '/wireguard/')) or
            name in secret_names or name.endswith(('.pem', '.key', '.p12', '.kdbx'))):
        return 'credentials'
    if any(token in value for token in ('/signal/', '/whatsapp/', '/telegram', '/element/', '/discord/')):
        return 'messengers'
    if any(token in value for token in ('/mozilla/', '/firefox/', '/chromium/', '/google-chrome/',
                                        '/brave/', '/microsoft-edge/')):
        return 'browsers'
    if name.endswith(tuple(documents)):
        return 'documents'
    if '/.git/' in value or name.endswith(tuple(source)):
        return 'source'
    return 'other'

for root in roots:
    for directory, dirs, files in os.walk(root, topdown=True, followlinks=False):
        if time.monotonic() - start > 20 or count >= 100000:
            truncated = True
            break
        real = os.path.realpath(directory)
        if real in seen_dirs or real in virtual_roots:
            dirs[:] = []
            continue
        seen_dirs.add(real)
        dirs[:] = [name for name in dirs
                   if not os.path.islink(os.path.join(directory, name))
                   and os.path.realpath(os.path.join(directory, name)) not in virtual_roots]
        for name in files:
            path = os.path.join(directory, name)
            try:
                info = os.stat(path, follow_symlinks=False)
                if not stat.S_ISREG(info.st_mode) or not os.access(path, os.R_OK):
                    continue
            except OSError:
                errors += 1
                continue
            bucket = categories[category(path)]
            bucket['files'] += 1
            bucket['bytes'] += info.st_size
            count += 1
            total_bytes += info.st_size
            if time.monotonic() - start > 20 or count >= 100000:
                truncated = True
                break
    if truncated:
        break

result = {'files': count, 'bytes': total_bytes, 'categories': categories,
          'truncated': truncated, 'errors': errors}
with open(os.path.join(sys.argv[1], 'survey.json'), 'w', encoding='utf-8') as output:
    json.dump(result, output, separators=(',', ':'))
PY
printf 'UAC-0145 lab stage executed\n' > "$work_dir/stage-complete"
