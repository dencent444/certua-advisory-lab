# Panel

The panel uses React/TypeScript, a C++20 HTTP server, and PostgreSQL. Build and run from the repository root:

```sh
PANEL_DATABASE_URL='host=/var/run/postgresql dbname=certua_panel user=certua_panel' ./panel/run 4173
```

The launcher needs Node.js/npm, g++, OpenSSH, libcurl, OpenSSL, nlohmann/json headers, and `libpq.so.5`. It installs frontend packages with `npm ci` when needed. After creating a PostgreSQL database, initialize its one admin account on the first run:

```sh
PANEL_DATABASE_URL='host=/var/run/postgresql dbname=certua_panel user=certua_panel' \
PANEL_BOOTSTRAP_USER=admin PANEL_BOOTSTRAP_PASSWORD='<at least 16 characters>' \
./panel/run 4173
```

The admin panel listens on `127.0.0.1:<port>`. Every page, asset, and admin API requires a login session; only `/login` and `POST /api/login` are public on that listener. PostgreSQL stores a single salted password hash and the agent heartbeat records. The Creds tab shows and changes this one account; changing it signs out all sessions.

A separate agent listener binds to `0.0.0.0` on the next port, or on `PANEL_AGENT_PORT` when set. It accepts heartbeats, WireGuard peer enrollment, and serves a fixed WireGuard client binary; panel pages, assets, admin APIs, and module scripts return 404 there. Module scripts are served only on the private WireGuard address `10.145.20.1:4182`. The server checks external reachability of the agent port through HackMyIP. If the port is not open, it launches a Pinggy HTTPS tunnel to **the agent listener only**. Free Pinggy URLs can change after reconnection.

Connect supplies Linux Bash and Windows PowerShell install commands. On Linux, run the command as a normal user with systemd; it creates `~/.local/share/certua-agent/agent.sh`, downloads and hash-checks the WireGuard userspace client, enables a user service, and enables linger (using `sudo` when needed) so the service survives logout and starts after reboot. The Linux agent needs Bash, curl, OpenSSL, and standard core utilities; `uac-0145-linux` also needs Python 3. To stop and remove it, run `systemctl --user disable --now certua-agent.service`, remove `~/.config/systemd/user/certua-agent.service` and `~/.local/share/certua-agent`, then run `systemctl --user daemon-reload`.

On Windows, run the PowerShell command as the user who should own the agent. It installs a `CertUaAgent` scheduled task, starts it immediately, and starts it again when that user logs on. To remove it, run `Unregister-ScheduledTask -TaskName CertUaAgent -Confirm:$false` and delete `%LOCALAPPDATA%\CertUaAgent`.

Both agents sign each heartbeat locally with HMAC-SHA256 and send it every 10 seconds. Every minute they include OS, architecture, CPU thread count, memory, and uptime; the panel shows these in Agents. The key is stored in PostgreSQL and never sent to the agent listener. Expired and repeated heartbeats are rejected; agents seen in the last 45 seconds appear in Connect and Agents. Disconnect in Agents marks the agent disabled in PostgreSQL. On its next heartbeat, the Linux agent removes its user systemd unit and exits; the Windows agent unregisters its scheduled task and exits. Test instances remain local to the current browser session.

Linux modules live in `panel/modules/<id>/` with `manifest.json` and `run.sh`; optional `stage.sh` is served through the private WireGuard listener. The ID must use lowercase letters, digits, and hyphens. The server reads modules from the directory next to `dist/`, so modules can be added without rebuilding the frontend or agent. The admin-only `/api/modules` lists modules, and `/api/tasks` queues and reports runs in PostgreSQL. The Linux agent receives a signed task on heartbeat, verifies its HMAC, enrolls an individual WireGuard key, opens a temporary userspace tunnel to the VPS, downloads and verifies the SHA-256 of `run.sh`, executes it as the agent user, and returns result evidence. The tunnel does not alter the host's routes. Treat adding a module as granting that script execution on selected Linux test hosts; review the script before installing it. Windows module execution is not implemented.

Starting a scenario opens a verbosity selector. `standard` records queue, dispatch, and outcome; `detailed` adds signed agent milestones; `trace` also records key and hash checks. After confirmation, the panel opens Attacks for that run. The timeline and graph use persistent PostgreSQL events exposed by the admin-only `/api/task-events?task=<id>` API and refresh while the run progresses. Agent milestones are sent as signed heartbeats; these event heartbeats never claim another queued task. Final evidence adds the second-stage and file-survey confirmations. The timeline records when each event reached the server; final evidence does not reconstruct the exact time of an internal module step. Existing installed Linux agents need the updated installer to emit detailed and trace milestones; standard server events still appear for older agents.

To write a module, follow [the porting pipeline](modules/PIPELINE.md). Each manifest records its UAC ID, source, required executable commands, bilingual limitations, and module-specific flow stages. Before a module's simulation starts, the server-supplied `run.sh` wrapper checks all declared commands on the selected agent. A missing dependency stops the scenario, records its name, and marks the task failed. `run.sh` receives a private temporary work directory as `$1`, the URL of its optional `stage.sh` as `$2`, and a local HTTP proxy into WireGuard as `$3`. Exit zero for success. It may write compact JSON to `$1/result.json` for evidence; the agent deletes the work directory after execution. Deploy the new directory beside `dist/`; it appears in Scenarios on the next refresh. [coverage.json](modules/coverage.json) tracks implemented Linux modules and distinct UAC IDs separately. Only install modules from trusted authors, because they run with the test user's permissions.

`uac-0145-linux` is a safe behavioral emulation of the CERT-UA UAC-0145 Linux SopraVPN chain. It establishes a real WireGuard session to the VPS, fetches code inside it, and executes a harmless second stage. That stage surveys **metadata only** for regular files readable by the agent account, including an `other` category, and reports counts and possible byte volume. It checks common data roots first, then the rest of `/`, without following symlinks or traversing virtual system directories. The 100,000-file or 20-second limit sets `truncated: true`, so a limited result is a lower bound. File contents are not read or transferred. The observed Linux second-stage payload was not disclosed by CERT-UA; this impact survey is a separate hypothesis informed by other UAC-0145 reports, not an attribution to the SopraVPN payload. Task completion reports execution, not an EDR detection verdict. A Windows-only sensor cannot report Linux process activity.

The VPS deployment uses `/opt/cert-ua-panel` and `certua-panel.service`, with admin port `4180` and agent port `4181`. Access the admin panel through SSH forwarding:

```sh
ssh -i ~/.ssh/vps_key -L 4180:127.0.0.1:4180 root@85.155.190.234
```

Then open `http://127.0.0.1:4180/login`. The VPS Nginx sites for the existing web app and CDN are not used by this panel.
