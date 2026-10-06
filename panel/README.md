# Panel operations

The [project README](../README.md) covers the first install and a test run. This file records the network boundaries, agent lifecycle, and optional WireGuard setup.

## Listeners and trust boundaries

| Listener | Bind address | Purpose |
| --- | --- | --- |
| Admin | `127.0.0.1:<admin-port>` | Login, UI, and authenticated APIs |
| Agent | `0.0.0.0:<agent-port>` | Heartbeats, WireGuard enrollment, fixed client download |
| Linux modules | `PANEL_MODULE_BIND:PANEL_MODULE_PORT` when configured | Module files for the private WireGuard channel |

`./panel/run <admin-port>` chooses the next port for agents; `PANEL_AGENT_PORT` overrides it. On the example VPS service, the ports are `4180` and `4181`. The admin listener stays on loopback. Use SSH forwarding for remote access:

```sh
ssh -L 4180:127.0.0.1:4180 <ssh-user>@<vps-host>
```

The server checks the agent port through HackMyIP. When the port is not publicly reachable, it starts a Pinggy HTTPS tunnel to that listener. The generated URL may change after a reconnect. The tunnel does not carry the admin UI or admin APIs. A direct agent connection uses HTTP; HMAC authenticates its messages but does not encrypt them. Generated install commands currently use either the detected public IP or the Pinggy URL, with no custom endpoint setting.

With `PANEL_MODULE_BIND` set, the agent listener does not serve module scripts. Without it, Linux module downloads fall back to the agent listener. The private channel below is recommended for a VPS that will run Linux scenarios.

## Private Linux module channel

The current agent protocol uses WireGuard interface `certua-lab`, internal address `10.145.20.1/24`, and module endpoint `10.145.20.1:4182`. These are fixed lab network settings, independent of the VPS public IP; check that the subnet does not overlap your network. Changing it requires code changes. The public WireGuard endpoint must currently be an IPv4 address and UDP port.

1. Install WireGuard tools on the VPS. Generate a server key pair:

   ```sh
   sudo install -d -m 0700 /etc/wireguard
   sudo sh -c 'umask 077; wg genkey > /etc/wireguard/certua-lab.key'
   sudo sh -c 'wg pubkey < /etc/wireguard/certua-lab.key > /etc/wireguard/certua-lab.pub'
   ```

   Create `/etc/wireguard/certua-lab.conf` with mode `0600`, using the contents of `certua-lab.key` as `PrivateKey`:

   ```ini
   [Interface]
   Address = 10.145.20.1/24
   ListenPort = 51820
   PrivateKey = <server-private-key>
   ```

   Start the interface and allow UDP `51820` through the VPS firewall. Keep the private key out of the repository:

   ```sh
   sudo systemctl enable --now wg-quick@certua-lab.service
   ```

2. Build the userspace client shipped with this repository. It needs the Go version declared in [`agent/wg-client/go.mod`](agent/wg-client/go.mod):

   ```sh
   cd /opt/cert-ua-panel/agent/wg-client
   sudo -u certua_panel go build -o ../../build/wg-client .
   ```

3. Run `sudo systemctl edit certua-panel.service` and add these variables, replacing the two placeholders with your server's public key and IPv4 address:

   ```ini
   [Service]
   Environment="PANEL_WG_SERVER_PUBLIC_KEY=<server-public-key>"
   Environment="PANEL_WG_PUBLIC_ENDPOINT=<vps-public-ip>:51820"
   Environment="PANEL_MODULE_BIND=10.145.20.1"
   Environment="PANEL_MODULE_PORT=4182"
   Environment="PANEL_MODULE_ENDPOINT=http://10.145.20.1:4182/api/agent/module"
   ```

   Restart the panel service. New Linux agent install commands now include the server key and endpoint; the agent checks both during enrollment.

4. Install [`deploy/certua-wg-sync.service`](deploy/certua-wg-sync.service) and [`deploy/certua-wg-sync.timer`](deploy/certua-wg-sync.timer), then enable the timer:

   ```sh
   sudo install -m 0644 /opt/cert-ua-panel/deploy/certua-wg-sync.service /etc/systemd/system/
   sudo install -m 0644 /opt/cert-ua-panel/deploy/certua-wg-sync.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now certua-wg-sync.timer
   ```

   The sync script reads enrolled peers from PostgreSQL and updates `certua-lab`. Its packaged defaults expect the `certua_panel` OS user, the `certua_panel` database, and the `/opt/cert-ua-panel` layout used in the project README.

If Linux agents were installed before WireGuard was enabled, reinstall them using a fresh command from `Connect` so they receive the new endpoint and client hash.

## Agent lifecycle

`Connect` produces an install command for Linux or Windows. Run it as the account that should own the agent. Linux requires Bash, curl, OpenSSL, standard command-line utilities, and a systemd user session; its installer enables linger so the service survives logout. The UAC-0145 Linux module also needs Python 3. Windows installs a `CertUaAgent` scheduled task for the current user. Older Windows installs need a fresh `Connect` command to receive task execution support.

Agents send a signed heartbeat every 10 seconds and host details once per minute. The server accepts a host as online if it has been seen within 45 seconds. `Disconnect` disables the agent in PostgreSQL; the agent removes its own service or task on the next heartbeat. UI test-instance entries are browser-session state, while agent identities, tasks, and events live in PostgreSQL.

If an agent cannot contact the server to receive `Disconnect`, remove it locally. On Linux, disable `certua-agent.service` with `systemctl --user disable --now`, remove `~/.config/systemd/user/certua-agent.service` and `~/.local/share/certua-agent`, then run `systemctl --user daemon-reload`. On Windows, unregister the `CertUaAgent` task and remove `%LOCALAPPDATA%\CertUaAgent`.

## Modules and evidence

Each folder under [`modules/`](modules) has a `manifest.json` and a platform script: `run.sh` for Linux or `run.ps1` for Windows. The server reads manifests when `/api/modules` is requested. The Linux agent checks the task signature, downloads the script, and verifies its SHA-256 before running it. The Windows agent verifies the signed task and hash of the script included in the heartbeat response.

The module checks its declared dependencies before the simulated chain starts. It runs with the agent user's permissions in a temporary directory and returns a compact `result.json` with stage results. The agent removes the directory after collecting evidence. `Tasks` and `Attacks` read persisted PostgreSQL events. Event timestamps are server receipt times; completion is not an EDR verdict.

The UAC-0145 Linux scenario surveys file **metadata** to estimate what a process with the agent user's access could reach. It does not read or transmit file contents. The 100,000-file and 20-second limits can make the count a lower bound; the survey is a lab impact hypothesis, not a published behavior of the original second stage.

Use the [selection register](modules/SELECTION.md) and [porting pipeline](modules/PIPELINE.md) before adding a module:

```sh
python3 panel/modules/validate.py --run
python3 panel/modules/coverage.py --write
```

The validator checks manifests and script syntax. It runs compatible Linux modules locally when their dependencies are present. A Windows host is needed for runtime testing; installing `pwsh` on Linux only enables PowerShell syntax parsing.

Use the root [`install.sh`](../install.sh) for a fresh Debian or Ubuntu VPS. The bundled [`deploy/install-release.sh`](deploy/install-release.sh) targets an existing installation and names services that may not exist on another VPS; adapt it before using it elsewhere.
