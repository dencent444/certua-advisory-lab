# Porting a UAC report into a Linux lab module

Use this sequence for every new scenario. A module is a reproducible lab observation, not a claim that the original malware or an EDR verdict was reproduced.

1. **Identify the case.** Link the CERT-UA advisory or a primary incident analysis. Record the UAC ID, incident date, target OS, named component, and the exact behavior supported by the source. Keep the case ID separate from the component name. Do not infer Linux behavior from a Windows or Solaris sample.
2. **Define the observable chain.** Pick a small number of distinct actions that a Linux sensor could see. For each action, state the exact signal, prerequisites, and what the publication leaves unknown. Describe the missing behavior in `limitationsEn` and `limitationsUk`.
3. **Bound the emulation.** Run as the test agent user. Use the private temporary `$1` directory for every write. Scope process tests to the module's own child; scope destructive commands to files created by the module. Do not install cron jobs, touch services or system disks, use real credentials, spread to other hosts, or contact infrastructure outside the lab.
4. **Implement the contract.** Create `modules/<id>/manifest.json` and standalone `run.sh`. The manifest needs `id`, `clusterId`, `platform: linux`, bilingual titles and descriptions, `sourceUrl`, `sourceLabel`, bilingual limitations, a `requires` list of executable commands, and `flow` stages with an ID, bilingual title, and bilingual note. The server prepends a dependency check to the served `run.sh` before calculating its signed SHA-256; an unavailable command stops the module before its simulation and is recorded as a failed task with the missing command names. `run.sh` receives work directory, optional private `stage.sh` URL, and optional WireGuard proxy. Exit nonzero when a required action fails. Write compact `result.json` containing `phases` booleans for the declared stage IDs and optional small `metrics`. Never report secrets or file contents. The agent deletes the work directory after it reads the result.
5. **Verify locally.** Run `python3 panel/modules/validate.py --run` from the repository root. It checks JSON, shell syntax, declared phase IDs, a fresh temporary run when dependencies are present, and result size. Compare `phases` with actual observable effects and confirm no file outside that directory changed. Missing dependencies are reported as skipped locally, never marked successful. The legacy UAC-0145 chain requires the live WireGuard lab and is syntax-checked by this command.
6. **Verify integration.** Build the React frontend and C++ server. Ensure the module appears in `/api/modules`, a selected Linux agent can run it through the private WireGuard endpoint, PostgreSQL records the `phase_*` evidence events, and Attacks shows the module-specific chain. Check an actual EDR alert separately; completion means the lab action ran.
7. **Deploy without disrupting other services.** Copy only panel artifacts and modules to the panel directory, restart only `certua-panel.service`, then check the panel and pre-existing VPS web and CDN services. No repository push is part of this pipeline.

Run `python3 panel/modules/coverage.py --write` after adding modules. [coverage.json](coverage.json) separates the number of runnable modules from the number of distinct UAC identifiers and links each implemented cluster to its sources. The public CERT-UA overview reported **over 150** tracked UAC clusters in 2025; this is a lower bound, not an exact current total or a count of Linux-capable clusters. A complete multi-platform catalog requires source-by-source curation and additional Windows/macOS modules.

## Current Linux set

| Module | Campaign | Source-supported behavior | Lab behavior |
| --- | --- | --- | --- |
| `uac-0145-linux` | UAC-0145 | Modified VPN client, VPN delivery, Linux second-stage command | Real lab WireGuard delivery and harmless stage; file metadata survey is a separate impact hypothesis |
| `uac-0002-loadgrip-linux` | UAC-0002 / UAC-0133 | LOADGRIP host-bound Linux loader and `ptrace` injection | Inert host-bound blob and `ptrace` handshake with its own child |
| `uac-0002-biasboat-linux` | UAC-0002 / UAC-0133 | BIASBOAT Linux backdoor staged as a host-bound encrypted file | Inert host-bound blob and one request to the private lab endpoint |
| `uac-0002-php-artifacts-linux` | UAC-0002 | PHP web shells and tunnels found in specialized software directories | Inert PHP file in temporary directory; local PHP check when installed |
| `uac-0082-orcshred-linux` | UAC-0082 | ORCSHRED cron scheduling and route discovery before SSH propagation | Local route read and uninstalled cron specimen |
| `uac-0082-awfulshred-linux` | UAC-0082 | AWFULSHRED service disruption and Linux file/disk wiping | Read-only service query and `shred` on module-owned scratch files |
| `uac-0002-weevely-http-linux` | UAC-0002 | WEEVELY PHP web shell found on Linux ICS hosts | Inert PHP endpoint and local authorized POST marker |
| `uac-0002-regeorg-http-linux` | UAC-0002 | REGEORG.NEO PHP tunnel found on Linux ICS hosts | Inert PHP fixed exchange on loopback |
| `uac-0002-pivotnacci-local-linux` | UAC-0002 | PIVOTNACCI found in specialized software directories | Fixed local HTTP agent request with no pivot |
| `uac-0002-biasboat-message-linux` | UAC-0002 | BIASBOAT Linux backdoor | Fixed local JSON ping/pong; no arbitrary commands |
| `uac-0082-orcshred-cron-linux` | UAC-0082 | ORCSHRED scheduled wiper launch | Read-only crontab check and uninstalled cron specimen |
| `uac-0082-orcshred-routes-linux` | UAC-0082 | ORCSHRED route discovery and /24 assumptions | `ip route` read and candidate counts, no scan |
| `uac-0082-orcshred-loopback-linux` | UAC-0082 | ORCSHRED SSH-port probes | TCP connect to reported ports on loopback only |
| `uac-0082-awfulshred-dd-linux` | UAC-0082 | AWFULSHRED `dd` fallback | Bounded `dd` overwrite of a module-owned file |
| `uac-0082-awfulshred-priority-linux` | UAC-0082 | Priority deletion of `/boot`, `/home`, `/var/log` | Removal of synthetic files under the work directory |
| `uac-0082-awfulshred-disks-linux` | UAC-0082 | Whole-disk targeting | Read-only `lsblk` inventory and aggregate counts |

SOLOSHRED is excluded from this Linux set: ESET identifies it as the Solaris wiper.

Primary sources: [CERT-UA UAC-0002 notice](https://cert.gov.ua/article/6278706), [SSSCIP/CERT-UA H1 2024 report](https://cip.gov.ua/services/cm/api/attachment/download?id=65898), [ESET analysis of UAC-0082](https://www.welivesecurity.com/2022/04/12/industroyer2-industroyer-reloaded/), [CERT-UA UAC-0145 notice](https://cert.gov.ua/article/6318863).
