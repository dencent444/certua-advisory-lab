#!/usr/bin/env bash
set -euo pipefail

declare -A wanted=()
rows="$(runuser -u certua_panel -- psql -d certua_panel -At -F '|' -v ON_ERROR_STOP=1 \
  -c "SELECT wg_public_key, wg_ip FROM public.panel_agents WHERE NOT disabled AND wg_public_key IS NOT NULL AND wg_ip IS NOT NULL")"
while IFS='|' read -r key ip; do
  [ -n "$key" ] || continue
  [[ "$key" =~ ^[A-Za-z0-9+/]{43}=$ ]] || exit 1
  [[ "$ip" =~ ^10\.145\.20\.([0-9]{1,3})$ ]] || exit 1
  octet="${BASH_REMATCH[1]}"
  (( octet >= 2 && octet <= 254 )) || exit 1
  wanted["$key"]=1
  wg set certua-lab peer "$key" allowed-ips "$ip/32"
done <<< "$rows"

while IFS= read -r key; do
  [ -n "$key" ] || continue
  if [ -z "${wanted[$key]+yes}" ]; then wg set certua-lab peer "$key" remove; fi
done < <(wg show certua-lab peers)
