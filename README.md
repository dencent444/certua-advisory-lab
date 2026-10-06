# CERT-UA Advisory Lab

Run a bounded simulation of a documented CERT-UA chain on a test host, then compare the resulting events with your EDR telemetry. The panel shows each stage, the agent's result, and the server-side timeline for that run.

The current catalog has [16 scenarios across 16 UAC clusters](panel/modules/coverage.json): 3 Linux and 13 Windows. Each module links to its source report and states which parts of the original chain are replaced with lab actions. The [selection register](panel/modules/SELECTION.md) explains why a cluster was included.

## What runs where

| Component | Job |
| --- | --- |
| React + TypeScript + Vite | Admin panel with English and Ukrainian UI |
| C++20 server + PostgreSQL | Login, agent enrollment, tasks, results, and logs |
| Linux / Windows agent | Pulls signed tasks and reports host status |
| `panel/modules/` | One directory per UAC scenario and operating system |

The admin listener binds to loopback. Agents use a separate port. If that port is unreachable from outside, the server starts a Pinggy HTTPS tunnel to the **agent listener only**. It never tunnels the admin panel. This behavior also applies to a local install.

## Run locally

Install PostgreSQL, Node.js 20.19+ or 22.12+, npm, a C++20 compiler, OpenSSH, libcurl, OpenSSL, the `nlohmann/json` headers, and the `libpq.so.5` runtime library. Create a PostgreSQL role and database; for example:

```sql
CREATE ROLE certua_panel LOGIN PASSWORD '<database-password>';
CREATE DATABASE certua_panel OWNER certua_panel;
```

From the repository root, run:

```sh
PANEL_DATABASE_URL='host=127.0.0.1 dbname=certua_panel user=certua_panel password=<database-password>' \
PANEL_BOOTSTRAP_USER=admin \
PANEL_BOOTSTRAP_PASSWORD='<at least 16 characters>' \
./panel/run 4173
```

Open `http://127.0.0.1:4173/login`. The bootstrap credentials create the one admin account on first run; later starts need only `PANEL_DATABASE_URL`. The launcher installs npm packages when needed and rebuilds the frontend and server. Its agent port is `4174` in this example; set `PANEL_AGENT_PORT` to choose another one.

## Install on a Linux VPS

On a fresh Debian or Ubuntu VPS (amd64 or arm64), clone the repository with an SSH key that has read access and run the root installer:

```sh
git clone git@github.com:dencent444/certua-advisory-lab.git
cd certua-advisory-lab
sudo ./install.sh
```

The repository is currently private, so an unauthenticated raw-file URL cannot download the script. If you download `install.sh` separately through an authenticated GitHub client, run `sudo bash install.sh`; the script clones the repository using the invoking user's Git credentials. Set `PANEL_REPO_URL` for a different remote.

It asks for the first admin password, installs the build dependencies and PostgreSQL, builds the panel, and starts `certua-panel.service`. By default it also creates the `certua-lab` WireGuard interface and peer sync timer for Linux modules. It checks ports `4180`–`4182`, the lab subnet, and existing service files before installing. It does not configure Nginx, your CDN, or firewall. Allow UDP `51820` if using WireGuard; TCP `4181` can stay closed if the automatic Pinggy agent tunnel is working. Keep the admin port private and use the SSH forward shown below.

For a VPS without a public IPv4 address, run `sudo PANEL_INSTALL_WIREGUARD=0 ./install.sh`. Set `PANEL_PUBLIC_IP` when automatic public IP detection is wrong. Run `./install.sh --help` for the full set of inputs. The installer stops if `/opt/cert-ua-panel` is already present; it is for a first install, not updates.

The following steps are the manual setup for hosts that need a different package manager or service layout. This example uses the paths and service account in [`panel/deploy/certua-panel.service`](panel/deploy/certua-panel.service). Install the same build dependencies as above, plus systemd and PostgreSQL on the VPS. The optional WireGuard channel currently expects a public IPv4 endpoint.

1. Create the `certua_panel` OS user, PostgreSQL role, and database. From the repository root, copy `panel/` to the service directory. The service uses PostgreSQL's local Unix socket, so the OS and database user names match:

   ```sh
   sudo useradd --system --home-dir /opt/cert-ua-panel --shell /usr/sbin/nologin certua_panel
   sudo -u postgres createuser certua_panel
   sudo -u postgres createdb --owner=certua_panel certua_panel
   sudo install -d -o certua_panel -g certua_panel /opt/cert-ua-panel
   sudo cp -a panel/. /opt/cert-ua-panel/
   sudo chown -R certua_panel:certua_panel /opt/cert-ua-panel
   ```

2. Build the panel in that directory. Node.js must be installed system-wide so the service user can run `npm`:

   ```sh
   cd /opt/cert-ua-panel
   sudo -u certua_panel npm ci
   sudo -u certua_panel npm run build
   sudo -u certua_panel mkdir -p build
   sudo -u certua_panel g++ -std=c++20 -O2 -Wall -Wextra -pthread server/main.cpp \
     -lcurl -lcrypto -ldl -o build/panel-server
   ```

   The service user must be able to write the Pinggy `known_hosts` file in `build/`.

3. Initialize the database and admin account once:

   ```sh
   sudo -u certua_panel env \
     PANEL_DATABASE_URL='host=/var/run/postgresql dbname=certua_panel user=certua_panel' \
     PANEL_BOOTSTRAP_USER=admin \
     PANEL_BOOTSTRAP_PASSWORD='<at least 16 characters>' \
     /opt/cert-ua-panel/build/panel-server --init-db
   ```

4. Install the service template and start it. The template uses admin port `4180` and agent port `4181`:

   ```sh
   sudo install -m 0644 /opt/cert-ua-panel/deploy/certua-panel.service /etc/systemd/system/certua-panel.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now certua-panel.service
   ```

Keep the admin port private. From an operator workstation, open it through SSH:

```sh
ssh -L 4180:127.0.0.1:4180 <ssh-user>@<vps-host>
```

Then visit `http://127.0.0.1:4180/login`. A direct agent connection on TCP `4181` uses HTTP, so limit that port to a trusted network. If the public port is closed, `Connect` will show the Pinggy HTTPS URL started by the server. Agent installation needs one of those paths to be reachable from the test host. For a private WireGuard module channel, follow the [WireGuard setup](panel/README.md#private-linux-module-channel) before enrolling Linux agents.

## Test your infrastructure

1. Pick a test machine with the EDR or logging stack you want to evaluate. Note the host, sensor, and time of the run.
2. Open `Connect` in the panel. Run its Linux or Windows install command **on that machine**, under the account you want the scenario to use. The agent stays active after the terminal closes: systemd user service on Linux, scheduled task on Windows.
3. Confirm the host appears in `Agents`. It sends a heartbeat every 10 seconds and basic host information once per minute.
4. In `Scenarios`, select a module compatible with that OS and review its source, dependencies, and stated limits. Choose `standard`, `detailed`, or `trace` verbosity and start the task. The panel opens `Attacks` for that run.
5. Compare the stage timestamps and process, task, registry, file, or network signals with your EDR events. `Tasks` keeps the final evidence in PostgreSQL. If a dependency is missing, the task reports it instead of claiming that stage ran.
6. Use `Disconnect` in `Agents` when finished. The agent removes its service or scheduled task on its next heartbeat.

For example, the UAC-0212 Windows module creates a local shortcut, starts PowerShell, writes a temporary `Run` value, and copies a module-owned sample document. It does not read the host's documents. The stages are visible separately in `Attacks`; an EDR detection must be checked in the EDR console.

## Modules and checks

Modules live under [`panel/modules/`](panel/modules). A Linux module has `manifest.json` and `run.sh`; a Windows module has `manifest.json` and `run.ps1`. Each manifest contains the CERT-UA source, bilingual UI text, prerequisites, stage names, and limits. Follow the [porting pipeline](panel/modules/PIPELINE.md) to add one.

```sh
python3 panel/modules/validate.py --run
python3 panel/modules/coverage.py --write
```

The validator checks manifests and script syntax, then runs modules supported by the current machine. Windows runtime checks require a Windows agent; syntax parsing on Linux requires `pwsh`. The detailed server, agent, and WireGuard configuration is in [panel/README.md](panel/README.md).

## Disclaimer

Run this tool only on systems you own or are authorized to test. Modules execute with the test user's permissions. A completed simulation confirms the lab steps ran; it is not an EDR verdict or proof that the original malware was reproduced.
