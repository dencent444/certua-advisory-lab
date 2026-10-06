# UAC scenario selection

One runnable scenario represents one documented UAC cluster on one supported OS. A component name, command, or generic behavior is not counted as another cluster. `coverage.json` counts distinct UAC identifiers separately from runnable scenarios. CERT-UA's 2025 overview says **more than 150** clusters were tracked; it does not publish an exact current total or imply that every cluster has a documented endpoint chain suitable for this lab.

## Port now

| Cluster | OS | Source-backed chain to reproduce | Boundary |
| --- | --- | --- | --- |
| UAC-0145 | Linux | Trojanized VPN client, tunnel, delivered Linux stage | Existing isolated WireGuard lab stage; no real malicious payload. |
| UAC-0002 | Linux | LOADGRIP host binding and process injection, followed by BIASBOAT / PHP artifacts observed at industrial targets | One scenario with host-bound lab blob, a trace of its own child, and local PHP artifact; no foreign process, credential capture, or external C2. |
| UAC-0082 | Linux | ORCSHRED host/network discovery and cron launch, then AWFULSHRED service/disk destruction | One scenario with a marked, immediately removed user cron entry, disposable local HTTP service, and scratch tree; no remote SSH spread or host disk write. |
| UAC-0010 | Windows | GammaLoad script execution, host identification, scheduled task, and GammaSteel-like document targeting | One scenario with inert script host execution, temporary task, and module-owned decoy files; no real documents or outbound transfer. |
| UAC-0063 | Windows | Macro-to-HTA HATVIBE delivery, scheduled launch, and CHERRYSPY Python stage | One scenario with inert HTA and Python-stage markers, temporary task, and cleanup; no Office macro or remote control. |
| UAC-0185 | Windows | LNK lure, `mshta`/PowerShell handoff, staged file, MESHAGENT-like persistence | One scenario with temporary artifacts and task; no real remote-control agent or credential collection. |
| UAC-0277 | Windows | Fake verification page, copied PowerShell command, MSI launch signal, LUNEXSTEALER stage | Local lure and encoded PowerShell marker; `msiexec` help process and inert package only. No install, BYOVD, browser extension, or theft. |
| UAC-0057 | Windows | OYSTERFRESH JScript, encoded HKCU stage, OYSTERSHUCK decode, OYSTERBLUES host profile | Script host, temporary HKCU value, reversible test text, and loopback HTTP. No downloaded code or browser data. |
| UAC-0244 | Windows | LNK to HTA, scheduled launch, AGINGFLY loader stage | Local LNK/HTA handoff, temporary task, and benign EXE copy. No process injection or external C2. |
| UAC-0255 | Windows | Fake CERT-UA archive, SysSvc stage, SvcHelper task, WebSocket handshake | Local archive, benign EXE copy, temporary task, and loopback WebSocket handshake. No RAT commands. |
| UAC-0252 | Windows | Fake app update, ZIP and EXE stage, SHADOWSNIFF/SALATSTEALER/DEAFTICK targeting | Local page, ZIP, benign EXE copy, and synthetic files only. No real website compromise or data access. |
| UAC-0001 | Windows | Office lure, LNK, COM hijack key, OneDriveHealth task, COVENANT stage | Inert document, unique temporary HKCU CLSID, task, and inert payload names. No CVE exploitation or Explorer restart. |
| UAC-0190 | Windows | Messenger double-extension lure, Python stage, host ID, Run-key foothold, beacon | Benign EXE copy, Python marker, temporary HKCU Run value, and loopback HTTP. No RAT or real files. |
| UAC-0212 | Windows | Supplier LNK, PowerShell, Run-key foothold, document staging | Local LNK process chain, unique temporary HKCU Run value, and `robocopy` over module-owned decoys. No real documents or external transfer. |
| UAC-0020 | Windows | CHM HTML content, PowerShell stage, SPECTR/FIRMACHAGENT files, two tasks | HTML stand-in, inert DLL names, decoy ZIP, and two temporary tasks. No active CHM exploit or browser collection. |
| UAC-0200 | Windows | Messenger archive, VBS/BAT handoff, DarkCrystal stage | Local ZIP substitute, VBS/BAT execution, and benign EXE copy. No password RAR SFX, Signal access, or RAT. |

Each row is one **bounded chain simulation** of a real, separately identified CERT-UA cluster. A passing phase means that the described lab signal occurred; it does not mean the malware ran or that an EDR would detect it. Windows chains need a Windows agent for runtime verification.

Sources: [CERT-UA UAC-0145](https://cert.gov.ua/article/6318863), [CERT-UA UAC-0002](https://cert.gov.ua/article/6278706), [SSSCIP H1 2024 report](https://cip.gov.ua/services/cm/api/attachment/download?id=65898), [CERT-UA UAC-0082](https://cert.gov.ua/article/39518), [ESET UAC-0082 analysis](https://www.welivesecurity.com/2022/04/12/industroyer2-industroyer-reloaded/), [CERT-UA UAC-0010](https://cert.gov.ua/article/18365), [CERT-UA UAC-0010 summary](https://cert.gov.ua/article/5160737), [CERT-UA UAC-0063](https://cert.gov.ua/article/6280129), [CERT-UA UAC-0185](https://cert.gov.ua/article/6281632). New cluster reports are linked individually in each manifest.

## Do not port as separate scenarios

| Candidate | Decision |
| --- | --- |
| A standalone `lsblk`, route read, cron-file draft, `dd` on scratch, or `shred` on scratch | These are pieces of UAC-0082, not UAC clusters. They must be stages in the integrated chain, with their limits explicit. |
| Standalone WEEVELY, REGEORG.NEO, PIVOTNACCI, or BIASBOAT ping | Tool names or isolated actions do not establish a distinct UAC campaign. They belong, where source-supported, inside UAC-0002. |
| SOLOSHRED as Linux | The primary analysis identifies it as Solaris; this lab has no Solaris agent. |
| Real credential theft, real file exfiltration, propagation to other hosts, production disk wipes, or arbitrary C2 commands | Unnecessary for validating the local process, file, task, and network telemetry; risk exceeds the test value. Report only module-owned decoys and counts. |
| Other UAC identifiers without a reviewed primary source and a documented chain for the target OS | Catalog candidates, then review source, prerequisites, observable stages, and limits before they become runnable. A UAC number alone is insufficient. |

This is a **selection register**, not the complete CERT-UA cluster database. The next catalog pass should ingest primary advisories into a separate non-runnable index, keep publication dates and source links, and mark each OS/chain as reviewed or pending. Do not infer total UAC count from the largest identifier.

## Source-backed candidates for the next review

| Cluster | Primary report | Why it is pending |
| --- | --- | --- |
| UAC-0099 | [CERT-UA, 21 July 2026](https://cert.gov.ua/article/6318634) | Review the Notepad++ plugin loading chain and pick a testable DLL-loading signal; a standalone Notepad++ launch would be a weak fragment. |
| UAC-0180 | [CERT-UA, 7 April 2026](https://cert.gov.ua/article/6280099) | Need a trustworthy GLUEEGG / ATERA test fixture before claiming that installer chain is reproducible. |

CERT-UA [merged UAC-0247 into UAC-0244](https://cert.gov.ua/article/6288271); the former ID is not counted as another independent cluster.

These are candidate **clusters**, not modules or additions to implemented coverage.

Count source: [SSSCIP/CERT-UA 2025 overview](https://cip.gov.ua/en/faqs/cyber-threat-overview-and-defense-strategies-in-2025-cert-ua-s-experience).
