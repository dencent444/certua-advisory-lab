#!/usr/bin/env bash
set -euo pipefail

repo_url="${PANEL_REPO_URL:-git@github.com:dencent444/certua-advisory-lab.git}"
install_dir=/opt/cert-ua-panel
service_user=certua_panel
wg_enabled="${PANEL_INSTALL_WIREGUARD:-1}"
wg_port="${PANEL_WG_PORT:-51820}"
stage=''

usage() {
  cat <<'EOF'
Usage: sudo ./install.sh

Run from a checkout or download this file and run it with sudo bash install.sh.
Supported hosts: Debian or Ubuntu with systemd, amd64 or arm64.

Environment:
  PANEL_REPO_URL             Readable Git URL for standalone installs
  PANEL_BOOTSTRAP_USER       Admin username (default: admin)
  PANEL_BOOTSTRAP_PASSWORD   Admin password (prompted if unset; 16+ characters)
  PANEL_PUBLIC_IP            Public IPv4 for WireGuard (detected if unset)
  PANEL_WG_PORT              WireGuard UDP port (default: 51820)
  PANEL_INSTALL_WIREGUARD    Set to 0 to skip the private Linux module channel

The script installs its own panel service. It does not edit Nginx, CDN,
existing websites, or firewall rules. It refuses an existing panel install.
EOF
}

die() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }

# Downloaded copies clone with the invoking user's Git credentials when run via sudo.
source_tree() {
  local script_dir
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "$script_dir/panel/package.json" && -f "$script_dir/panel/server/main.cpp" ]]; then
    printf '%s\n' "$script_dir"
  else
    if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]] && id "$SUDO_USER" >/dev/null 2>&1; then
      chmod 0711 "$stage"
      install -d -m 0700 -o "$SUDO_USER" -g "$(id -gn "$SUDO_USER")" "$stage/repo"
      runuser -u "$SUDO_USER" -- git clone --depth 1 "$repo_url" "$stage/repo" >&2
    else
      git clone --depth 1 "$repo_url" "$stage/repo" >&2
    fi
    printf '%s\n' "$stage/repo"
  fi
}

# Fetch an official release and check the published SHA-256 before using it.
download_node() {
  local arch="$1" checksums archive file
  checksums="$stage/node-shasums"
  curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$checksums"
  file="$(awk -v arch="$arch" '$2 ~ ("^node-v22[.][0-9]+[.][0-9]+-linux-" arch "[.]tar[.]xz$") { print $2; exit }' "$checksums")"
  [[ -n "$file" ]] || die "No Node.js 22 build for $arch"
  archive="$stage/$file"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$file" -o "$archive"
  (cd "$stage" && awk -v file="$file" '$2 == file { print; found=1 } END { if (!found) exit 1 }' "$checksums" | sha256sum -c -) || die 'Node.js checksum failed'
  mkdir -p "$stage/node"
  tar -xJf "$archive" -C "$stage/node" --strip-components=1
  export PATH="$stage/node/bin:$PATH"
}

# Build the tunnel helper with the version declared by its Go module.
download_go() {
  local arch="$1" version="$2" file hash
  file="go${version}.linux-${arch}.tar.gz"
  curl -fsSL 'https://go.dev/dl/?mode=json&include=all' -o "$stage/go-releases.json"
  hash="$(python3 - "$stage/go-releases.json" "$file" <<'PY'
import json, sys
for release in json.load(open(sys.argv[1])):
    for item in release['files']:
        if item['filename'] == sys.argv[2]:
            print(item['sha256'])
            raise SystemExit
raise SystemExit(1)
PY
)" || die "Go release $file was not found"
  curl -fsSL "https://go.dev/dl/$file" -o "$stage/$file"
  (cd "$stage" && printf '%s  %s\n' "$hash" "$file" | sha256sum -c -) || die 'Go checksum failed'
  tar -xzf "$stage/$file" -C "$stage"
  export PATH="$stage/go/bin:$PATH"
}

# A dedicated interface avoids changing the host's default routes or web stack.
configure_wireguard() {
  local public_ip="$1" private_key public_key
  install -d -m 0700 /etc/wireguard
  umask 077
  private_key="$(wg genkey)"
  public_key="$(printf '%s' "$private_key" | wg pubkey)"
  printf '[Interface]\nAddress = 10.145.20.1/24\nListenPort = %s\nPrivateKey = %s\n' \
    "$wg_port" "$private_key" > /etc/wireguard/certua-lab.conf
  chmod 0600 /etc/wireguard/certua-lab.conf
  install -d -m 0755 /etc/systemd/system/certua-panel.service.d
  cat > /etc/systemd/system/certua-panel.service.d/wireguard.conf <<EOF
[Unit]
After=wg-quick@certua-lab.service
Requires=wg-quick@certua-lab.service

[Service]
Environment="PANEL_WG_SERVER_PUBLIC_KEY=$public_key"
Environment="PANEL_WG_PUBLIC_ENDPOINT=$public_ip:$wg_port"
Environment="PANEL_MODULE_BIND=10.145.20.1"
Environment="PANEL_MODULE_PORT=4182"
Environment="PANEL_MODULE_ENDPOINT=http://10.145.20.1:4182/api/agent/module"
EOF
  systemctl daemon-reload
  systemctl enable --now wg-quick@certua-lab.service
  install -m 0644 "$install_dir/deploy/certua-wg-sync.service" /etc/systemd/system/
  install -m 0644 "$install_dir/deploy/certua-wg-sync.timer" /etc/systemd/system/
}

main() {
  [[ "${1:-}" != --help && "${1:-}" != -h ]] || { usage; return 0; }
  (($# == 0)) || { usage >&2; return 2; }
  ((EUID == 0)) || die 'Run as root: sudo ./install.sh'
  [[ -f /etc/os-release ]] || die 'Debian or Ubuntu is required'
  . /etc/os-release
  [[ "$ID" == debian || "$ID" == ubuntu ]] || die 'Debian or Ubuntu is required'
  command -v systemctl >/dev/null || die 'systemd is required'
  command -v apt-get >/dev/null || die 'apt-get is required'
  [[ ! -e "$install_dir" ]] || die "$install_dir already exists; this installer is for a first install"
  for unit in certua-panel.service certua-wg-sync.timer; do
    [[ ! -e "/etc/systemd/system/$unit" ]] || die "$unit already exists"
  done
  [[ "$wg_enabled" == 0 || "$wg_enabled" == 1 ]] || die 'PANEL_INSTALL_WIREGUARD must be 0 or 1'
  [[ "$wg_port" =~ ^[0-9]+$ ]] && ((wg_port >= 1 && wg_port <= 65535)) || die 'Invalid PANEL_WG_PORT'
  local arch go_arch public_ip source_root admin_user admin_password go_version
  case "$(uname -m)" in
    x86_64) arch=x64; go_arch=amd64 ;;
    aarch64) arch=arm64; go_arch=arm64 ;;
    *) die 'Only amd64 and arm64 are supported' ;;
  esac
  admin_user="${PANEL_BOOTSTRAP_USER:-admin}"
  admin_password="${PANEL_BOOTSTRAP_PASSWORD:-}"
  if [[ -z "$admin_password" ]]; then
    [[ -r /dev/tty ]] || die 'Set PANEL_BOOTSTRAP_PASSWORD for a noninteractive install'
    read -r -s -p 'New panel password (16+ characters): ' admin_password < /dev/tty
    printf '\n' > /dev/tty
  fi
  ((${#admin_password} >= 16)) || die 'PANEL_BOOTSTRAP_PASSWORD needs at least 16 characters'
  [[ -n "$admin_user" ]] || die 'PANEL_BOOTSTRAP_USER cannot be empty'
  stage="$(mktemp -d /tmp/certua-install.XXXXXXXX)"
  trap 'if [[ -n "$stage" ]]; then rm -rf -- "$stage"; fi' EXIT
  log 'Installing build and runtime packages'
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl git xz-utils python3 \
    g++ make libcurl4-openssl-dev libssl-dev nlohmann-json3-dev libpq5 \
    postgresql postgresql-client openssh-client iproute2 wireguard-tools
  if [[ "$wg_enabled" == 1 ]]; then
    [[ ! -e /etc/wireguard/certua-lab.conf ]] || die 'WireGuard interface certua-lab already exists'
    [[ -z "$(ip -4 route show 10.145.20.0/24)" ]] || die '10.145.20.0/24 already has a route'
  fi
  local tcp_ports=(4180 4181)
  if [[ "$wg_enabled" == 1 ]]; then tcp_ports+=(4182); fi
  for port in "${tcp_ports[@]}"; do
    if ss -H -ltn "( sport = :$port )" | grep -q .; then die "TCP port $port is in use"; fi
  done
  if [[ "$wg_enabled" == 1 ]] && ss -H -lun "( sport = :$wg_port )" | grep -q .; then
    die "UDP port $wg_port is in use"
  fi
  public_ip="${PANEL_PUBLIC_IP:-}"
  if [[ "$wg_enabled" == 1 && -z "$public_ip" ]]; then
    public_ip="$(curl -fsS4 --max-time 10 https://api.ipify.org)" || die 'Set PANEL_PUBLIC_IP to the VPS public IPv4'
  fi
  if [[ "$wg_enabled" == 1 ]]; then
    python3 - "$public_ip" <<'PY' || die 'PANEL_PUBLIC_IP must be a public IPv4 address'
import ipaddress, sys
address = ipaddress.ip_address(sys.argv[1])
assert address.version == 4 and address.is_global
PY
  fi
  source_root="$(source_tree)"
  log 'Building frontend and server'
  download_node "$arch"
  cp -a "$source_root/panel" "$stage/panel"
  (cd "$stage/panel" && npm ci && npm run build)
  mkdir -p "$stage/panel/build"
  (cd "$stage/panel" && g++ -std=c++20 -O2 -Wall -Wextra -pthread \
    server/main.cpp -lcurl -lcrypto -ldl -o build/panel-server)
  if [[ "$wg_enabled" == 1 ]]; then
    go_version="$(awk '$1 == "go" {print $2; exit}' "$stage/panel/agent/wg-client/go.mod")"
    [[ "$go_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'Invalid Go version in go.mod'
    log 'Building private WireGuard client'
    download_go "$go_arch" "$go_version"
    (cd "$stage/panel/agent/wg-client" && GOTOOLCHAIN=local go build -o ../../build/wg-client .)
  fi
  python3 "$stage/panel/modules/validate.py"

  log 'Creating dedicated PostgreSQL role and service account'
  systemctl is-active --quiet postgresql.service || systemctl start postgresql.service
  getent group "$service_user" >/dev/null || groupadd --system "$service_user"
  id "$service_user" >/dev/null 2>&1 || useradd --system --gid "$service_user" \
    --home-dir "$install_dir" --shell /usr/sbin/nologin "$service_user"
  [[ "$(id -gn "$service_user")" == "$service_user" ]] || die "$service_user must use its matching group"
  if [[ "$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='certua_panel'")" != 1 ]]; then
    runuser -u postgres -- createuser certua_panel
  fi
  if [[ "$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='certua_panel'")" != 1 ]]; then
    runuser -u postgres -- createdb --owner=certua_panel certua_panel
  fi
  install -d -o "$service_user" -g "$service_user" -m 0750 "$install_dir"
  cp -a "$source_root/panel/README.md" "$source_root/panel/deploy" "$source_root/panel/modules" \
    "$stage/panel/dist" "$install_dir/"
  install -d -m 0750 "$install_dir/build"
  install -m 0750 "$stage/panel/build/panel-server" "$install_dir/build/panel-server"
  if [[ "$wg_enabled" == 1 ]]; then
    install -m 0750 "$stage/panel/build/wg-client" "$install_dir/build/wg-client"
  fi
  chown -R "$service_user:$service_user" "$install_dir"
  runuser -u "$service_user" -- env \
    PANEL_DATABASE_URL='host=/var/run/postgresql dbname=certua_panel user=certua_panel' \
    PANEL_BOOTSTRAP_USER="$admin_user" PANEL_BOOTSTRAP_PASSWORD="$admin_password" \
    "$install_dir/build/panel-server" --init-db
  unset admin_password PANEL_BOOTSTRAP_PASSWORD

  log 'Starting panel service'
  install -m 0644 "$install_dir/deploy/certua-panel.service" /etc/systemd/system/
  if [[ "$wg_enabled" == 1 ]]; then configure_wireguard "$public_ip"; fi
  systemctl daemon-reload
  systemctl enable --now certua-panel.service
  if [[ "$wg_enabled" == 1 ]]; then systemctl enable --now certua-wg-sync.timer; fi
  local ready=0
  for attempt in {1..20}; do
    if curl --fail --silent --max-time 2 http://127.0.0.1:4180/login -o /dev/null; then
      ready=1
      break
    fi
    sleep 1
  done
  [[ "$ready" == 1 ]] || die 'Panel did not serve the login page; inspect journalctl -u certua-panel'
  cat <<EOF

Panel installed. Open it from your workstation with:
  ssh -L 4180:127.0.0.1:4180 <ssh-user>@<vps-host>
  http://127.0.0.1:4180/login

Admin login: $admin_user
Agent listener: TCP 4181 (or the automatic Pinggy HTTPS URL in Connect).
EOF
  if [[ "$wg_enabled" == 1 ]]; then
    printf 'Private Linux module channel: UDP %s; allow it in your firewall.\n' "$wg_port"
  fi
}

main "$@"
