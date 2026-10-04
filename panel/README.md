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

A separate agent listener binds to `0.0.0.0` on the next port, or on `PANEL_AGENT_PORT` when set. It accepts only `POST /api/agent/heartbeat`; panel pages, assets, and admin APIs return 404 there. The server checks external reachability of the agent port through HackMyIP. If the port is not open, it launches a Pinggy HTTPS tunnel to **the agent listener only**. Free Pinggy URLs can change after reconnection.

Connect supplies Linux Bash and Windows PowerShell install commands. On Linux, run the command as a normal user with systemd; it creates `~/.local/share/certua-agent/agent.sh`, enables a user service, and enables linger (using `sudo` when needed) so the service survives logout and starts after reboot. The Linux agent needs Bash, curl, OpenSSL, and standard core utilities. To stop and remove it, run `systemctl --user disable --now certua-agent.service`, remove `~/.config/systemd/user/certua-agent.service` and `~/.local/share/certua-agent`, then run `systemctl --user daemon-reload`.

On Windows, run the PowerShell command as the user who should own the agent. It installs a `CertUaAgent` scheduled task, starts it immediately, and starts it again when that user logs on. To remove it, run `Unregister-ScheduledTask -TaskName CertUaAgent -Confirm:$false` and delete `%LOCALAPPDATA%\CertUaAgent`.

Both agents sign each heartbeat locally with HMAC-SHA256 and send it every 10 seconds. Every minute they include OS, architecture, CPU thread count, memory, and uptime; the panel shows these in Agents. The key is stored in PostgreSQL and never sent to the agent listener. Expired and repeated heartbeats are rejected; agents seen in the last 45 seconds appear in Connect and Agents. Disconnect in Agents marks the agent disabled in PostgreSQL. On its next heartbeat, the Linux agent removes its user systemd unit and exits; the Windows agent unregisters its scheduled task and exits. Task pull is not implemented. Test instances remain local to the current browser session. Tasks, Scenarios, and Attacks have no sample data.

The VPS deployment uses `/opt/cert-ua-panel` and `certua-panel.service`, with admin port `4180` and agent port `4181`. Access the admin panel through SSH forwarding:

```sh
ssh -i ~/.ssh/vps_key -L 4180:127.0.0.1:4180 root@85.155.190.234
```

Then open `http://127.0.0.1:4180/login`. The VPS Nginx sites for the existing web app and CDN are not used by this panel.
