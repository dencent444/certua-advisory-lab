#!/usr/bin/env bash
set -euo pipefail

archive=${1:?usage: install-release.sh archive.tgz}
base=/opt/cert-ua-panel
stage=$(mktemp -d /tmp/certua-panel-release.XXXXXX)
backup="$base/release-prev-$(date -u +%Y%m%dT%H%M%SZ)"
swapped=0
rollback() {
  local status=$?
  if (( status != 0 && swapped == 1 )); then
    systemctl stop certua-panel.service || true
    if [[ -d "$base/dist" ]]; then mv "$base/dist" "$stage/failed-dist"; fi
    if [[ -d "$base/modules" ]]; then mv "$base/modules" "$stage/failed-modules"; fi
    if [[ -d "$backup/dist" ]]; then mv "$backup/dist" "$base/dist"; fi
    if [[ -d "$backup/modules" ]]; then mv "$backup/modules" "$base/modules"; fi
    if [[ -f "$backup/panel-server" ]]; then install -m 0755 "$backup/panel-server" "$base/build/panel-server"; fi
    if [[ -f "$backup/README.md" ]]; then install -m 0644 "$backup/README.md" "$base/README.md"; fi
    systemctl start certua-panel.service || true
  fi
  rm -rf -- "$stage"
  exit "$status"
}
trap rollback EXIT

tar -xzf "$archive" -C "$stage"
test -x "$stage/build/panel-server"
test -f "$stage/dist/index.html"
test -f "$stage/modules/SELECTION.md"
python3 "$stage/modules/validate.py"
mkdir -p "$backup"
cp -a "$base/build/panel-server" "$backup/panel-server"
cp -a "$base/README.md" "$backup/README.md"
swapped=1
mv "$base/dist" "$backup/dist"
mv "$base/modules" "$backup/modules"
mv "$stage/dist" "$base/dist"
mv "$stage/modules" "$base/modules"
install -m 0755 "$stage/build/panel-server" "$base/build/panel-server"
install -m 0644 "$stage/README.md" "$base/README.md"
chown -R certua_panel:certua_panel "$base/dist" "$base/modules" "$base/build/panel-server" "$base/README.md"
systemctl restart certua-panel.service
ready=0
for attempt in {1..20}; do
  if systemctl is-active --quiet certua-panel.service &&
     curl --fail --silent --output /dev/null http://127.0.0.1:4180/login; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" -eq 1
systemctl is-active --quiet nginx.service
systemctl is-active --quiet baltvera-api.service
systemctl is-active --quiet researchnode-api.service
echo "Panel release installed; backup: $backup"
