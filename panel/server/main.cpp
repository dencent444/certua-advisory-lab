#include <arpa/inet.h>
#include <curl/curl.h>
#include <netinet/in.h>
#include <nlohmann/json.hpp>
#include <openssl/crypto.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>

#include <algorithm>
#include <cctype>
#include <chrono>
#include <csignal>
#include <ctime>
#include <fcntl.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "postgres.hpp"

using nlohmann::json;
namespace fs = std::filesystem;

struct LogRecord {
  std::string time;
  std::string level;
  std::string en;
  std::string uk;
};

struct ProbeResult {
  std::string state = "unknown";
  std::string host;
  std::string checked_at;
};

struct AgentRecord {
  std::string name;
  std::string last_seen;
  std::chrono::steady_clock::time_point heartbeat;
};

struct TunnelStatus {
  std::string state = "waiting";
  std::string url;
};

std::mutex state_mutex;
std::mutex probe_mutex;
std::map<std::string, std::vector<LogRecord>> logs;
std::map<std::string, AgentRecord> agents;
std::map<std::string, std::chrono::steady_clock::time_point> used_nonces;
std::map<std::string, std::chrono::steady_clock::time_point> sessions;
ProbeResult probe;
TunnelStatus tunnel;
std::string agent_key;
std::unique_ptr<Postgres> database;
int listen_port = 0;
int agent_port = 0;
int admin_socket = -1;
int agent_socket = -1;
volatile std::sig_atomic_t stop_requested = 0;
fs::path dist_dir;

std::string now_utc() {
  const auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
  std::tm utc{};
  gmtime_r(&now, &utc);
  char out[32];
  std::strftime(out, sizeof(out), "%Y-%m-%dT%H:%M:%SZ", &utc);
  return out;
}

void append_log(const std::string& tab, const std::string& level,
                const std::string& en, const std::string& uk) {
  std::lock_guard lock(state_mutex);
  auto& entries = logs[tab];
  entries.insert(entries.begin(), {now_utc(), level, en, uk});
  if (entries.size() > 50) entries.resize(50);
}

size_t curl_write(char* data, size_t size, size_t count, void* context) {
  auto* body = static_cast<std::string*>(context);
  body->append(data, size * count);
  return size * count;
}

ProbeResult check_public_port() {
  ProbeResult result;
  result.checked_at = now_utc();
  CURL* curl = curl_easy_init();
  if (!curl) {
    result.state = "unavailable";
    return result;
  }

  std::string body;
  const std::string url = "https://hackmyip.com/api/ports?ports=" + std::to_string(agent_port);
  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_write);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &body);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, 8L);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(curl, CURLOPT_USERAGENT, "cert-ua-panel/0.1");
  // A proxy would test the proxy's public IP instead of this machine.
  curl_easy_setopt(curl, CURLOPT_PROXY, "");
  curl_easy_setopt(curl, CURLOPT_NOPROXY, "*");
  const CURLcode code = curl_easy_perform(curl);
  long http_status = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_status);
  curl_easy_cleanup(curl);

  if (code != CURLE_OK || http_status != 200) {
    result.state = "unavailable";
    return result;
  }
  try {
    const auto response = json::parse(body);
    if (!response.value("success", false)) throw std::runtime_error("probe failed");
    const auto& data = response.at("data");
    result.host = data.value("host", "");
    const auto& ports = data.at("ports");
    if (!ports.is_array() || ports.empty()) throw std::runtime_error("no port result");
    const std::string state = ports.at(0).value("status", "");
    if (state == "open" || state == "closed" || state == "filtered" || state == "blocked") {
      result.state = state;
    } else {
      result.state = "unavailable";
    }
  } catch (const std::exception&) {
    result.state = "unavailable";
  }
  return result;
}

void refresh_probe() {
  std::lock_guard probe_lock(probe_mutex);
  const ProbeResult next = check_public_port();
  {
    std::lock_guard state_lock(state_mutex);
    probe = next;
  }
  const std::map<std::string, std::string> uk_state = {
    {"open", "доступний"}, {"closed", "закритий"}, {"filtered", "фільтрується"},
    {"blocked", "заблокований"}, {"unavailable", "недоступна"},
  };
  const auto translated = uk_state.find(next.state);
  append_log("connect", next.state == "open" ? "INFO" : "WARN",
             "External port check: " + next.state,
             "Зовнішня перевірка порту: " +
                 (translated == uk_state.end() ? next.state : translated->second));
}

std::string random_token() {
  unsigned char bytes[32];
  if (RAND_bytes(bytes, sizeof(bytes)) != 1) throw std::runtime_error("random bytes unavailable");
  constexpr char hex[] = "0123456789abcdef";
  std::string token;
  token.reserve(64);
  for (const unsigned char byte : bytes) {
    token += hex[byte >> 4];
    token += hex[byte & 0x0f];
  }
  return token;
}

std::string password_digest(const std::string& password, const std::string& salt) {
  if (salt.size() != 32) throw std::runtime_error("invalid password salt");
  const auto nibble = [](char ch) -> unsigned {
    return ch <= '9' ? static_cast<unsigned>(ch - '0') : static_cast<unsigned>(ch - 'a' + 10);
  };
  unsigned char salt_bytes[16];
  for (size_t index = 0; index < 16; ++index) {
    salt_bytes[index] = static_cast<unsigned char>(nibble(salt[index * 2]) * 16 +
                                                  nibble(salt[index * 2 + 1]));
  }
  unsigned char digest[32];
  if (PKCS5_PBKDF2_HMAC(password.c_str(), password.size(), salt_bytes, sizeof(salt_bytes),
                        210000, EVP_sha256(), sizeof(digest), digest) != 1) {
    throw std::runtime_error("password hashing failed");
  }
  constexpr char hex[] = "0123456789abcdef";
  std::string result;
  result.reserve(64);
  for (const unsigned char byte : digest) {
    result += hex[byte >> 4];
    result += hex[byte & 0x0f];
  }
  return result;
}

struct Account {
  std::string username;
  std::string salt;
  std::string hash;
};

Account load_account() {
  const auto rows = database->query("SELECT username, salt, password_hash FROM public.panel_admin WHERE id = 1");
  if (rows.size() != 1 || rows[0].size() != 3) throw std::runtime_error("panel account is missing");
  return {rows[0][0], rows[0][1], rows[0][2]};
}

bool check_account(const std::string& username, const std::string& password) {
  const Account account = load_account();
  const std::string actual = password_digest(password, account.salt);
  return username == account.username && account.hash.size() == actual.size() &&
         CRYPTO_memcmp(account.hash.data(), actual.data(), actual.size()) == 0;
}

void initialize_database() {
  database = std::make_unique<Postgres>();
  database->query("CREATE TABLE IF NOT EXISTS public.panel_admin ("
                  "id SMALLINT PRIMARY KEY CHECK (id = 1), "
                  "username TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL)");
  database->query("CREATE TABLE IF NOT EXISTS public.panel_agents ("
                  "id TEXT PRIMARY KEY, name TEXT NOT NULL, last_seen TIMESTAMPTZ NOT NULL, "
                  "info JSONB NOT NULL DEFAULT '{}'::jsonb, disabled BOOLEAN NOT NULL DEFAULT false)");
  database->query("ALTER TABLE public.panel_agents ADD COLUMN IF NOT EXISTS info JSONB NOT NULL DEFAULT '{}'::jsonb");
  database->query("ALTER TABLE public.panel_agents ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false");
  database->query("CREATE TABLE IF NOT EXISTS public.panel_settings ("
                  "key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  database->query("INSERT INTO public.panel_settings (key, value) VALUES ('agent_key', $1) "
                  "ON CONFLICT (key) DO NOTHING", {random_token()});
  const auto rows = database->query("SELECT id FROM public.panel_admin WHERE id = 1");
  if (!rows.empty()) return;
  const char* username = std::getenv("PANEL_BOOTSTRAP_USER");
  const char* password = std::getenv("PANEL_BOOTSTRAP_PASSWORD");
  if (!username || !password || !*username || std::string(password).size() < 16) {
    throw std::runtime_error("set PANEL_BOOTSTRAP_USER and PANEL_BOOTSTRAP_PASSWORD to create the first account");
  }
  const std::string salt = random_token().substr(0, 32);
  database->query("INSERT INTO public.panel_admin (id, username, salt, password_hash) "
                  "VALUES (1, $1, $2, $3) ON CONFLICT (id) DO NOTHING",
                  {username, salt, password_digest(password, salt)});
}

std::string cookie_value(const std::string& request, const std::string& name) {
  std::istringstream lines(request);
  std::string line;
  while (std::getline(lines, line)) {
    if (line.rfind("Cookie:", 0) != 0) continue;
    std::istringstream cookies(line.substr(7));
    std::string item;
    while (std::getline(cookies, item, ';')) {
      const auto first = item.find_first_not_of(" \t");
      if (first != std::string::npos && item.substr(first, name.size() + 1) == name + "=") {
        const auto value = item.substr(first + name.size() + 1);
        return value.substr(0, value.find_first_of("\r\n"));
      }
    }
  }
  return "";
}

bool authenticated(const std::string& request) {
  const std::string token = cookie_value(request, "panel_session");
  if (token.size() != 64) return false;
  std::lock_guard lock(state_mutex);
  const auto session = sessions.find(token);
  return session != sessions.end() && session->second > std::chrono::steady_clock::now();
}

json live_agents_unlocked() {
  json result = json::array();
  const auto rows = database->query(
      "SELECT id, name, to_char(last_seen AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), info::text "
      "FROM public.panel_agents WHERE NOT disabled AND last_seen > now() - INTERVAL '45 seconds' ORDER BY name");
  for (const auto& row : rows) {
    result.push_back({{"id", row[0]}, {"name", row[1]}, {"lastSeen", row[2]},
                      {"info", json::parse(row[3])}});
  }
  return result;
}

bool valid_agent_base_url(const std::string& url) {
  if (url.rfind("http://", 0) != 0 && url.rfind("https://", 0) != 0) return false;
  return std::all_of(url.begin(), url.end(), [](unsigned char ch) {
    return std::isalnum(ch) || ch == ':' || ch == '/' || ch == '.' || ch == '-';
  });
}

void replace_all(std::string& value, const std::string& needle, const std::string& replacement) {
  size_t position = 0;
  while ((position = value.find(needle, position)) != std::string::npos) {
    value.replace(position, needle.size(), replacement);
    position += replacement.size();
  }
}

std::string agent_command(const std::string& base_url) {
  if (!valid_agent_base_url(base_url)) return "";
  std::string command = R"PANEL($ErrorActionPreference = 'Stop'
$agentDir = Join-Path $env:LOCALAPPDATA 'CertUaAgent'
New-Item -ItemType Directory -Path $agentDir -Force | Out-Null
$agentFile = Join-Path $agentDir 'agent.ps1'
[guid]::NewGuid().ToString('N') | Set-Content -LiteralPath (Join-Path $agentDir 'id') -Encoding ASCII
@'
$ErrorActionPreference = 'Stop'
$agentDir = Join-Path $env:LOCALAPPDATA 'CertUaAgent'
$idFile = Join-Path $agentDir 'id'
$agentId = (Get-Content -LiteralPath $idFile -Raw).Trim()
$keyHex = '__KEY__'
$keyBytes = New-Object byte[] ($keyHex.Length / 2)
for ($i = 0; $i -lt $keyBytes.Length; $i++) {
  $keyBytes[$i] = [Convert]::ToByte($keyHex.Substring($i * 2, 2), 16)
}
$hmac = [System.Security.Cryptography.HMACSHA256]::new($keyBytes)
$lastInfo = 0
while ($true) {
  try {
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $nonce = [guid]::NewGuid().ToString('N')
    $name = $env:COMPUTERNAME
    $info = ''
    if ($ts - $lastInfo -ge 60) {
      $os = Get-CimInstance Win32_OperatingSystem
      $uptime = [int64]([DateTime]::UtcNow - $os.LastBootUpTime.ToUniversalTime()).TotalSeconds
      $info = @{ os = $os.Caption; arch = $env:PROCESSOR_ARCHITECTURE; cpu = [int]$env:NUMBER_OF_PROCESSORS; memoryMiB = [int]($os.TotalVisibleMemorySize / 1024); uptimeSeconds = $uptime } | ConvertTo-Json -Compress
      $lastInfo = $ts
    }
    $message = $agentId + '|' + $ts + '|' + $nonce + '|' + $name
    if ($info) { $message += '|' + $info }
    $signature = [BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))).Replace('-', '').ToLowerInvariant()
    $payload = @{ id = $agentId; name = $name; ts = $ts; nonce = $nonce; signature = $signature }
    if ($info) { $payload.info = $info }
    $body = $payload | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Method Post -Uri '__ENDPOINT__' -ContentType 'application/json' -Body $body -TimeoutSec 20
    if ($response.disconnect) {
      Unregister-ScheduledTask -TaskName 'CertUaAgent' -Confirm:$false -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $agentDir -Recurse -Force -ErrorAction SilentlyContinue
      exit 0
    }
  } catch {
    Write-Warning $_.Exception.Message
  }
  Start-Sleep -Seconds 10
}
'@ | Set-Content -LiteralPath $agentFile -Encoding UTF8
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $agentFile + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$existing = Get-ScheduledTask -TaskName 'CertUaAgent' -ErrorAction SilentlyContinue
if ($existing) { Stop-ScheduledTask -TaskName 'CertUaAgent' -ErrorAction SilentlyContinue }
Register-ScheduledTask -TaskName 'CertUaAgent' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'CertUaAgent'
Write-Host 'CertUaAgent scheduled task started.'
)PANEL";
  replace_all(command, "__KEY__", agent_key);
  replace_all(command, "__ENDPOINT__", base_url + "/api/agent/heartbeat");
  return command;
}

std::string linux_agent_command(const std::string& base_url) {
  if (!valid_agent_base_url(base_url)) return "";
  std::string command = R"PANEL(bash <<'PANEL_INSTALL'
set -euo pipefail
for tool in systemctl loginctl curl openssl od hostname tr date uname nproc awk; do
  command -v "$tool" >/dev/null || { printf 'Missing command: %s\n' "$tool" >&2; exit 1; }
done
user_name="$(id -un)"
if [ "$(loginctl show-user "$user_name" -p Linger --value 2>/dev/null)" != yes ]; then
  if [ "$(id -u)" -eq 0 ]; then
    loginctl enable-linger "$user_name"
  else
    command -v sudo >/dev/null || { printf 'sudo is required to enable linger\n' >&2; exit 1; }
    sudo loginctl enable-linger "$user_name"
  fi
fi
agent_dir="$HOME/.local/share/certua-agent"
unit_dir="$HOME/.config/systemd/user"
mkdir -p "$agent_dir" "$unit_dir"
chmod 700 "$agent_dir"
openssl rand -hex 16 > "$agent_dir/id"
chmod 600 "$agent_dir/id"
cat > "$agent_dir/agent.sh" <<'PANEL_AGENT_BODY'
#!/usr/bin/env bash
set -euo pipefail
agent_dir="$HOME/.local/share/certua-agent"
agent_id="$(cat "$agent_dir/id")"
key_hex='__KEY__'
endpoint='__ENDPOINT__'
name="$(hostname | tr -cd '[:alnum:]._-')"
name="${name:0:80}"
name="${name:-linux-agent}"
os="$(uname -s | tr -cd '[:alnum:]_.-')"
arch="$(uname -m | tr -cd '[:alnum:]_.-')"
last_info=0
while :; do
  ts="$(date -u +%s)"
  nonce="$(openssl rand -hex 16)"
  message="${agent_id}|${ts}|${nonce}|${name}"
  info=''
  if (( ts - last_info >= 60 )); then
    cpu="$(nproc)"
    memory_mib="$(awk '/MemTotal:/ {printf "%d", $2 / 1024}' /proc/meminfo)"
    uptime_seconds="$(awk '{print int($1)}' /proc/uptime)"
    info="$(printf '{"os":"%s","arch":"%s","cpu":%s,"memoryMiB":%s,"uptimeSeconds":%s}' "$os" "$arch" "$cpu" "$memory_mib" "$uptime_seconds")"
    message="${message}|${info}"
    last_info="$ts"
  fi
  signature="$(printf '%s' "$message" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:${key_hex}" -binary | od -An -tx1 | tr -d '[:space:]')"
  if [ -n "$info" ]; then
    escaped_info="${info//\"/\\\"}"
    body="$(printf '{"id":"%s","name":"%s","ts":%s,"nonce":"%s","signature":"%s","info":"%s"}' "$agent_id" "$name" "$ts" "$nonce" "$signature" "$escaped_info")"
  else
    body="$(printf '{"id":"%s","name":"%s","ts":%s,"nonce":"%s","signature":"%s"}' "$agent_id" "$name" "$ts" "$nonce" "$signature")"
  fi
  if response="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 -H 'Content-Type: application/json' --data-binary "$body" "$endpoint")"; then
    if [[ "$response" == *'"disconnect":true'* ]]; then
      systemctl --user disable certua-agent.service >/dev/null || true
      rm -f "$HOME/.config/systemd/user/certua-agent.service" "$agent_dir/agent.sh" "$agent_dir/id"
      systemctl --user daemon-reload
      rmdir "$agent_dir" || true
      exit 0
    fi
  else
    printf 'Heartbeat failed\n' >&2
  fi
  sleep 10
done
PANEL_AGENT_BODY
chmod 700 "$agent_dir/agent.sh"
cat > "$unit_dir/certua-agent.service" <<'PANEL_UNIT'
[Unit]
Description=CERT-UA panel heartbeat agent
Wants=network-online.target
After=network-online.target

[Service]
ExecStart=%h/.local/share/certua-agent/agent.sh
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=default.target
PANEL_UNIT
systemctl --user daemon-reload
systemctl --user enable certua-agent.service
systemctl --user restart certua-agent.service
printf 'certua-agent.service started\n'
PANEL_INSTALL)PANEL";
  replace_all(command, "__KEY__", agent_key);
  replace_all(command, "__ENDPOINT__", base_url + "/api/agent/heartbeat");
  return command;
}

bool valid_signature(const std::string& id, const std::string& name, int64_t timestamp,
                     const std::string& nonce, const std::string& signature,
                     const std::string& info) {
  const auto now = static_cast<int64_t>(std::time(nullptr));
  if (timestamp < now - 45 || timestamp > now + 45 || nonce.size() != 32 ||
      signature.size() != 64 || name.find('|') != std::string::npos) return false;
  const auto is_hex = [](unsigned char ch) {
    return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f');
  };
  if (!std::all_of(nonce.begin(), nonce.end(), is_hex) ||
      !std::all_of(signature.begin(), signature.end(), is_hex)) return false;
  const auto nibble = [](char ch) -> unsigned {
    return ch <= '9' ? static_cast<unsigned>(ch - '0') : static_cast<unsigned>(ch - 'a' + 10);
  };
  unsigned char key[32];
  for (size_t index = 0; index < 32; ++index) {
    key[index] = static_cast<unsigned char>(nibble(agent_key[index * 2]) * 16 +
                                            nibble(agent_key[index * 2 + 1]));
  }
  const std::string message = id + "|" + std::to_string(timestamp) + "|" + nonce + "|" + name +
                              (info.empty() ? "" : "|" + info);
  unsigned char digest[EVP_MAX_MD_SIZE];
  unsigned int length = 0;
  if (!HMAC(EVP_sha256(), key, sizeof(key),
            reinterpret_cast<const unsigned char*>(message.data()), message.size(),
            digest, &length) || length != 32) return false;
  constexpr char hex[] = "0123456789abcdef";
  std::string expected;
  expected.reserve(64);
  for (unsigned index = 0; index < length; ++index) {
    expected += hex[digest[index] >> 4];
    expected += hex[digest[index] & 0xf];
  }
  return CRYPTO_memcmp(expected.data(), signature.data(), expected.size()) == 0;
}

json connection_status() {
  std::lock_guard lock(state_mutex);
  const std::string base_url = probe.state == "open" && !probe.host.empty()
                                   ? "http://" + probe.host + ":" + std::to_string(agent_port)
                                   : tunnel.url;
  return {
    {"port", agent_port},
    {"adminPort", listen_port},
    {"probe", {{"state", probe.state}, {"host", probe.host}, {"checkedAt", probe.checked_at},
               {"source", "hackmyip.com"}}},
    {"tunnel", {{"state", tunnel.state}, {"url", tunnel.url}}},
    {"agentCommand", agent_command(base_url)},
    {"linuxAgentCommand", linux_agent_command(base_url)},
    {"agents", live_agents_unlocked()},
    {"agentPullReady", false},
  };
}

int free_debugger_port() {
  const int socket_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (socket_fd < 0) return 0;
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  address.sin_port = 0;
  int port = 0;
  if (bind(socket_fd, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == 0) {
    socklen_t length = sizeof(address);
    if (getsockname(socket_fd, reinterpret_cast<sockaddr*>(&address), &length) == 0) {
      port = ntohs(address.sin_port);
    }
  }
  close(socket_fd);
  return port;
}

pid_t start_tunnel(int debugger_port) {
  const std::string remote = "-R0:localhost:" + std::to_string(agent_port);
  const std::string debugger = "-L" + std::to_string(debugger_port) +
                               ":localhost:" + std::to_string(debugger_port);
  const std::string known_hosts = "UserKnownHostsFile=" +
                                  (dist_dir.parent_path() / "build" / "pinggy_known_hosts").string();
  const pid_t child = fork();
  if (child != 0) return child;
  const int null_fd = open("/dev/null", O_RDWR);
  if (null_fd >= 0) {
    dup2(null_fd, STDIN_FILENO);
    dup2(null_fd, STDOUT_FILENO);
    dup2(null_fd, STDERR_FILENO);
    if (null_fd > STDERR_FILENO) close(null_fd);
  }
  if (admin_socket >= 0) close(admin_socket);
  if (agent_socket >= 0) close(agent_socket);
  execlp("ssh", "ssh", "-p", "443", "-T", "-o", "BatchMode=yes", "-o",
         "ExitOnForwardFailure=yes", "-o", "StrictHostKeyChecking=accept-new", "-o",
         known_hosts.c_str(), "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=30",
         "-o", "ServerAliveCountMax=3", remote.c_str(), debugger.c_str(),
         "free.pinggy.io", static_cast<char*>(nullptr));
  _exit(127);
}

void stop_tunnel(pid_t child) {
  if (child <= 0) return;
  kill(child, SIGTERM);
  int status = 0;
  for (int attempt = 0; attempt < 20; ++attempt) {
    if (waitpid(child, &status, WNOHANG) != 0) return;
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }
  kill(child, SIGKILL);
  waitpid(child, &status, 0);
}

std::string read_tunnel_url(int debugger_port) {
  CURL* curl = curl_easy_init();
  if (!curl) return "";
  std::string body;
  const std::string url = "http://127.0.0.1:" + std::to_string(debugger_port) + "/urls";
  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_write);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &body);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT_MS, 1500L);
  curl_easy_setopt(curl, CURLOPT_PROXY, "");
  curl_easy_setopt(curl, CURLOPT_NOPROXY, "*");
  const CURLcode code = curl_easy_perform(curl);
  long status = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
  curl_easy_cleanup(curl);
  if (code != CURLE_OK || status != 200) return "";
  try {
    const auto response = json::parse(body);
    for (const auto& item : response.at("urls")) {
      if (item.is_string()) {
        const std::string candidate = item.get<std::string>();
        if (candidate.rfind("https://", 0) == 0) return candidate;
      }
    }
  } catch (const std::exception&) {}
  return "";
}

void publish_tunnel(const std::string& state, const std::string& url = "") {
  bool changed = false;
  {
    std::lock_guard lock(state_mutex);
    changed = tunnel.state != state || tunnel.url != url;
    tunnel = {state, url};
  }
  if (!changed) return;
  if (state == "active") {
    append_log("connect", "INFO", "Pinggy HTTPS tunnel is active", "HTTPS-тунель Pinggy активний");
  } else if (state == "error") {
    append_log("connect", "WARN", "Pinggy tunnel disconnected; retrying", "Тунель Pinggy відключився; повторна спроба");
  }
}

void manage_connection() {
  pid_t child = -1;
  int debugger_port = 0;
  auto last_probe = std::chrono::steady_clock::time_point::min();
  auto next_start = std::chrono::steady_clock::time_point::min();
  while (!stop_requested) {
    const auto now = std::chrono::steady_clock::now();
    if (last_probe == std::chrono::steady_clock::time_point::min() ||
        now - last_probe >= std::chrono::seconds(60)) {
      refresh_probe();
      last_probe = std::chrono::steady_clock::now();
    }
    bool port_open = false;
    {
      std::lock_guard lock(state_mutex);
      port_open = probe.state == "open";
    }
    if (port_open) {
      stop_tunnel(child);
      child = -1;
      publish_tunnel("not_needed");
    } else {
      if (child > 0) {
        int status = 0;
        const pid_t exited = waitpid(child, &status, WNOHANG);
        if (exited == child || exited < 0) {
          child = -1;
          publish_tunnel("error");
          next_start = std::chrono::steady_clock::now() + std::chrono::seconds(10);
        }
      }
      if (child < 0 && std::chrono::steady_clock::now() >= next_start) {
        debugger_port = free_debugger_port();
        child = debugger_port ? start_tunnel(debugger_port) : -1;
        if (child > 0) publish_tunnel("starting");
        else {
          publish_tunnel("error");
          next_start = std::chrono::steady_clock::now() + std::chrono::seconds(10);
        }
      }
      if (child > 0) {
        const std::string url = read_tunnel_url(debugger_port);
        if (!url.empty()) publish_tunnel("active", url);
      }
    }
    for (int tick = 0; tick < 10 && !stop_requested; ++tick) {
      std::this_thread::sleep_for(std::chrono::milliseconds(200));
    }
  }
  stop_tunnel(child);
}

std::string query_value(const std::string& target, const std::string& name) {
  const auto query_start = target.find('?');
  if (query_start == std::string::npos) return "";
  std::istringstream query(target.substr(query_start + 1));
  std::string part;
  while (std::getline(query, part, '&')) {
    const auto equals = part.find('=');
    if (equals != std::string::npos && part.substr(0, equals) == name) {
      return part.substr(equals + 1);
    }
  }
  return "";
}

std::string content_type(const fs::path& path) {
  const auto extension = path.extension().string();
  if (extension == ".html") return "text/html; charset=utf-8";
  if (extension == ".js") return "text/javascript; charset=utf-8";
  if (extension == ".css") return "text/css; charset=utf-8";
  if (extension == ".svg") return "image/svg+xml";
  if (extension == ".woff2") return "font/woff2";
  if (extension == ".woff") return "font/woff";
  if (extension == ".png") return "image/png";
  return "application/octet-stream";
}

void send_all(int client, const std::string& data) {
  size_t offset = 0;
  while (offset < data.size()) {
    const ssize_t sent = send(client, data.data() + offset, data.size() - offset, MSG_NOSIGNAL);
    if (sent <= 0) break;
    offset += static_cast<size_t>(sent);
  }
}

void reply(int client, int status, const std::string& type, const std::string& body,
           bool head_only = false, const std::string& extra_headers = "") {
  const char* reason = status == 200 ? "OK" : status == 400 ? "Bad Request" :
                       status == 302 ? "Found" : status == 401 ? "Unauthorized" :
                       status == 403 ? "Forbidden" :
                       status == 404 ? "Not Found" : status == 405 ? "Method Not Allowed" :
                       "Internal Server Error";
  std::ostringstream header;
  header << "HTTP/1.1 " << status << ' ' << reason << "\r\n"
         << "Content-Type: " << type << "\r\n"
         << "Content-Length: " << body.size() << "\r\n"
         << "Cache-Control: no-store\r\n"
         << "X-Content-Type-Options: nosniff\r\n"
         << "Connection: close\r\n" << extra_headers << "\r\n";
  send_all(client, header.str());
  if (!head_only) send_all(client, body);
}

std::optional<std::string> request_body(int client, const std::string& request) {
  const auto header_end = request.find("\r\n\r\n");
  if (header_end == std::string::npos) return std::nullopt;
  size_t length = 0;
  std::istringstream headers(request.substr(0, header_end));
  std::string header;
  while (std::getline(headers, header)) {
    const auto colon = header.find(':');
    if (colon != std::string::npos && header.substr(0, colon) == "Content-Length") {
      try { length = std::stoul(header.substr(colon + 1)); }
      catch (const std::exception&) { return std::nullopt; }
    }
  }
  if (length == 0 || length > 4096) return std::nullopt;
  std::string body = request.substr(header_end + 4);
  char buffer[2048];
  while (body.size() < length) {
    const ssize_t count = recv(client, buffer, std::min(sizeof(buffer), length - body.size()), 0);
    if (count <= 0) return std::nullopt;
    body.append(buffer, static_cast<size_t>(count));
  }
  return body.substr(0, length);
}

std::string login_page(bool ukrainian) {
  const std::string title = ukrainian ? "Вхід до панелі" : "Panel sign in";
  const std::string username = ukrainian ? "Ім’я користувача" : "Username";
  const std::string password = ukrainian ? "Пароль" : "Password";
  const std::string submit = ukrainian ? "Увійти" : "Sign in";
  const std::string error = ukrainian ? "Неправильні дані доступу" : "Invalid credentials";
  return "<!doctype html><html lang='" + std::string(ukrainian ? "uk" : "en") +
         "'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
         "<title>" + title + " · Panel</title><style>"
         "*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fff;font:13px system-ui,sans-serif}"
         "main{width:min(400px,calc(100vw - 32px));border:1px solid #a7192d;padding:28px}h1{font-size:20px;margin:0 0 26px}"
         "label{display:block;margin:16px 0 7px}input{width:100%;height:40px;padding:8px 10px;background:#080808;color:#fff;border:1px solid #8b1527}"
         "button{width:100%;height:42px;margin-top:24px;background:#ff304c;color:#000;border:0;font-weight:700;cursor:pointer}"
         "#error{min-height:18px;color:#ff546a;margin-top:12px}</style><main><h1>" + title + "</h1>"
         "<form><label for='username'>" + username + "</label><input id='username' autocomplete='username' required>"
         "<label for='password'>" + password + "</label><input id='password' type='password' autocomplete='current-password' required>"
         "<button>" + submit + "</button><div id='error' role='alert'></div></form></main><script>"
         "document.querySelector('form').addEventListener('submit',async function(event){event.preventDefault();"
         "const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},"
         "body:JSON.stringify({username:document.getElementById('username').value,password:document.getElementById('password').value})});"
         "if(response.ok){location.href='/main'+location.search}else{document.getElementById('error').textContent='" + error + "'}});"
         "</script></html>";
}

void handle_client(int client, bool agent_listener) {
  std::string request;
  char buffer[2048];
  while (request.size() < 8192 && request.find("\r\n\r\n") == std::string::npos) {
    const ssize_t received = recv(client, buffer, sizeof(buffer), 0);
    if (received <= 0) break;
    request.append(buffer, static_cast<size_t>(received));
  }
  std::istringstream line(request.substr(0, request.find("\r\n")));
  std::string method, target, version;
  line >> method >> target >> version;
  const std::string path = target.substr(0, target.find('?'));
  if (agent_listener && (method != "POST" || path != "/api/agent/heartbeat")) {
    reply(client, 404, "application/json", R"({"error":"not found"})");
    close(client);
    return;
  }
  if (!agent_listener && path == "/api/agent/heartbeat") {
    reply(client, 404, "application/json", R"({"error":"not found"})");
    close(client);
    return;
  }
  if (!agent_listener && method != "GET" && method != "HEAD" && method != "POST") {
    reply(client, 405, "application/json", R"({"error":"method not allowed"})");
    close(client);
    return;
  }

  const bool head_only = method == "HEAD";
  try {
    if (method == "POST" && path == "/api/agent/heartbeat") {
      const auto header_end = request.find("\r\n\r\n");
      size_t body_length = 0;
      std::istringstream headers(request.substr(0, header_end));
      std::string header;
      while (std::getline(headers, header)) {
        const auto colon = header.find(':');
        if (colon != std::string::npos && header.substr(0, colon) == "Content-Length") {
          body_length = std::stoul(header.substr(colon + 1));
        }
      }
      if (header_end == std::string::npos || body_length == 0 || body_length > 4096) {
        reply(client, 400, "application/json", R"({"error":"invalid body"})");
      } else {
        std::string body = request.substr(header_end + 4);
        while (body.size() < body_length) {
          const ssize_t count = recv(client, buffer, std::min(sizeof(buffer), body_length - body.size()), 0);
          if (count <= 0) break;
          body.append(buffer, static_cast<size_t>(count));
        }
        if (body.size() < body_length) {
          reply(client, 400, "application/json", R"({"error":"incomplete body"})");
        } else {
          const auto payload = json::parse(body.substr(0, body_length));
          const std::string id = payload.value("id", "");
          const std::string name = payload.value("name", "");
          const int64_t timestamp = payload.value("ts", int64_t{0});
          const std::string nonce = payload.value("nonce", "");
          const std::string signature = payload.value("signature", "");
          const std::string info = payload.contains("info") && payload["info"].is_string()
                                       ? payload["info"].get<std::string>() : "";
          const json parsed_info = info.empty() ? json::object() : json::parse(info, nullptr, false);
          if (id.empty() || id.size() > 64 || name.empty() || name.size() > 80 ||
                     !std::all_of(id.begin(), id.end(), [](unsigned char ch) {
                       return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'z') || ch == '-';
                     })) {
            reply(client, 400, "application/json", R"({"error":"invalid agent"})");
          } else if (info.size() > 512 || !parsed_info.is_object()) {
            reply(client, 400, "application/json", R"({"error":"invalid info"})");
          } else if (!valid_signature(id, name, timestamp, nonce, signature, info)) {
            reply(client, 403, "application/json", R"({"error":"invalid signature"})");
          } else {
            bool is_new = false;
            bool replay = false;
            bool disabled = false;
            {
              std::lock_guard lock(state_mutex);
              const auto now = std::chrono::steady_clock::now();
              for (auto entry = used_nonces.begin(); entry != used_nonces.end();) {
                if (now - entry->second > std::chrono::seconds(60)) entry = used_nonces.erase(entry);
                else ++entry;
              }
              replay = used_nonces.contains(nonce);
              if (!replay) {
                used_nonces[nonce] = now;
                const auto rows = database->query("SELECT disabled FROM public.panel_agents WHERE id = $1", {id});
                disabled = !rows.empty() && rows[0][0] == "t";
                if (!disabled) {
                  database->query("INSERT INTO public.panel_agents (id, name, last_seen) VALUES ($1, $2, now()) "
                                  "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, last_seen = now()",
                                  {id, name});
                  if (!info.empty()) {
                    database->query("UPDATE public.panel_agents SET info = $2::jsonb WHERE id = $1", {id, info});
                  }
                  is_new = !agents.contains(id);
                  agents[id] = {name, now_utc(), now};
                }
              }
            }
            if (replay) {
              reply(client, 403, "application/json", R"({"error":"replayed heartbeat"})");
            } else if (disabled) {
              reply(client, 200, "application/json", R"({"disconnect":true})");
            } else {
              if (is_new) {
              append_log("agents", "INFO", "Agent connected: " + name,
                         "Агент підключився: " + name);
              append_log("connect", "INFO", "Agent connected: " + name,
                         "Агент підключився: " + name);
              }
              reply(client, 200, "application/json", R"({"ok":true})");
            }
          }
        }
      }
      close(client);
      return;
    }
    if (path == "/api/login" && method == "POST") {
      const auto body = request_body(client, request);
      const auto payload = body ? json::parse(*body, nullptr, false) : json();
      if (!payload.is_object() || !payload.contains("username") || !payload["username"].is_string() ||
          !payload.contains("password") || !payload["password"].is_string()) {
        reply(client, 400, "application/json", R"({"error":"invalid request"})");
      } else if (!check_account(payload["username"].get<std::string>(),
                                payload["password"].get<std::string>())) {
        reply(client, 401, "application/json", R"({"error":"invalid credentials"})");
      } else {
        const std::string token = random_token();
        {
          std::lock_guard lock(state_mutex);
          sessions[token] = std::chrono::steady_clock::now() + std::chrono::hours(8);
        }
        reply(client, 200, "application/json", R"({"ok":true})", false,
              "Set-Cookie: panel_session=" + token + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800\r\n");
      }
      close(client);
      return;
    }
    if (path == "/login" && (method == "GET" || method == "HEAD")) {
      if (authenticated(request)) {
        reply(client, 302, "text/plain", "", head_only, "Location: /main\r\n");
      } else {
        reply(client, 200, "text/html; charset=utf-8",
              login_page(query_value(target, "lang") == "uk"), head_only);
      }
      close(client);
      return;
    }
    if (!authenticated(request)) {
      if (path.rfind("/api/", 0) == 0 || method == "POST") {
        reply(client, 401, "application/json", R"({"error":"authentication required"})", head_only);
      } else {
        const std::string language = query_value(target, "lang") == "uk" ? "?lang=uk" : "";
        reply(client, 302, "text/plain", "", head_only, "Location: /login" + language + "\r\n");
      }
      close(client);
      return;
    }
    if (path == "/api/logout" && method == "POST") {
      {
        std::lock_guard lock(state_mutex);
        sessions.erase(cookie_value(request, "panel_session"));
      }
      reply(client, 200, "application/json", R"({"ok":true})", false,
            "Set-Cookie: panel_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0\r\n");
      close(client);
      return;
    }
    if (path == "/api/creds" && method == "POST") {
      const auto body = request_body(client, request);
      const auto payload = body ? json::parse(*body, nullptr, false) : json();
      if (!payload.is_object() || !payload.contains("username") || !payload["username"].is_string() ||
          !payload.contains("currentPassword") || !payload["currentPassword"].is_string() ||
          !payload.contains("newPassword") || !payload["newPassword"].is_string()) {
        reply(client, 400, "application/json", R"({"error":"invalid request"})");
      } else {
        const std::string username = payload["username"].get<std::string>();
        const std::string current = payload["currentPassword"].get<std::string>();
        const std::string next = payload["newPassword"].get<std::string>();
        if (username.empty() || username.size() > 64 || next.size() < 16 || next.size() > 256) {
          reply(client, 400, "application/json", R"({"error":"username or password length invalid"})");
        } else if (!check_account(load_account().username, current)) {
          reply(client, 403, "application/json", R"({"error":"current password invalid"})");
        } else {
          const std::string salt = random_token().substr(0, 32);
          database->query("UPDATE public.panel_admin SET username = $1, salt = $2, password_hash = $3 WHERE id = 1",
                          {username, salt, password_digest(next, salt)});
          {
            std::lock_guard lock(state_mutex);
            sessions.clear();
          }
          append_log("creds", "INFO", "Panel credentials changed", "Дані входу до панелі змінено");
          reply(client, 200, "application/json", R"({"ok":true})", false,
                "Set-Cookie: panel_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0\r\n");
        }
      }
      close(client);
      return;
    }
    if (path == "/api/agents/disconnect" && method == "POST") {
      const auto body = request_body(client, request);
      const auto payload = body ? json::parse(*body, nullptr, false) : json();
      if (!payload.is_object() || !payload.contains("id") || !payload["id"].is_string() ||
          payload["id"].get<std::string>().size() > 64) {
        reply(client, 400, "application/json", R"({"error":"invalid agent"})");
      } else {
        const std::string id = payload["id"].get<std::string>();
        const auto rows = database->query(
            "UPDATE public.panel_agents SET disabled = true WHERE id = $1 AND NOT disabled RETURNING name", {id});
        if (rows.empty()) {
          reply(client, 404, "application/json", R"({"error":"agent not found"})");
        } else {
          {
            std::lock_guard lock(state_mutex);
            agents.erase(id);
          }
          append_log("agents", "INFO", "Agent disconnected: " + rows[0][0],
                     "Агента відключено: " + rows[0][0]);
          reply(client, 200, "application/json", R"({"ok":true})");
        }
      }
      close(client);
      return;
    }
    if (method == "POST") {
      reply(client, 405, "application/json", R"({"error":"method not allowed"})");
      close(client);
      return;
    }
    if (path == "/api/health") {
      reply(client, 200, "application/json", json{{"ok", true}}.dump(), head_only);
    } else if (path == "/api/connection") {
      if (query_value(target, "check") == "1") refresh_probe();
      reply(client, 200, "application/json", connection_status().dump(), head_only);
    } else if (path == "/api/agents") {
      json connected;
      {
        std::lock_guard lock(state_mutex);
        connected = live_agents_unlocked();
      }
      reply(client, 200, "application/json",
            json{{"agents", connected}, {"pullImplemented", false}}.dump(), head_only);
    } else if (path == "/api/creds") {
      reply(client, 200, "application/json", json{{"username", load_account().username}}.dump(), head_only);
    } else if (path == "/api/logs") {
      const std::string tab = query_value(target, "tab");
      const std::string language = query_value(target, "lang") == "uk" ? "uk" : "en";
      json entries = json::array();
      {
        std::lock_guard lock(state_mutex);
        for (const auto& item : logs[tab]) {
          entries.push_back({{"time", item.time}, {"level", item.level},
                             {"message", language == "uk" ? item.uk : item.en}});
        }
      }
      reply(client, 200, "application/json", json{{"tab", tab}, {"entries", entries}}.dump(), head_only);
    } else if (path.rfind("/api/", 0) == 0) {
      reply(client, 404, "application/json", R"({"error":"not found"})", head_only);
    } else {
      if (path.find("..") != std::string::npos || path.find('\\') != std::string::npos) {
        reply(client, 400, "text/plain", "Invalid path", head_only);
      } else {
        fs::path file = dist_dir / path.substr(1);
        if (path == "/" || !fs::is_regular_file(file)) file = dist_dir / "index.html";
        std::ifstream stream(file, std::ios::binary);
        if (!stream) {
          reply(client, 404, "text/plain", "Not found", head_only);
        } else {
          const std::string body((std::istreambuf_iterator<char>(stream)), std::istreambuf_iterator<char>());
          reply(client, 200, content_type(file), body, head_only);
        }
      }
    }
  } catch (const std::exception& error) {
    std::cerr << "request error: " << error.what() << '\n';
    reply(client, 500, "application/json", R"({"error":"internal error"})", head_only);
  }
  close(client);
}

int make_listener(int port, in_addr_t address_type) {
  const int listener = socket(AF_INET, SOCK_STREAM, 0);
  if (listener < 0) return -1;
  const int reuse = 1;
  setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(address_type);
  address.sin_port = htons(static_cast<uint16_t>(port));
  if (bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address)) < 0 ||
      listen(listener, 64) < 0) {
    perror("listen");
    close(listener);
    return -1;
  }
  fcntl(listener, F_SETFL, fcntl(listener, F_GETFL, 0) | O_NONBLOCK);
  return listener;
}

void accept_clients(int listener, bool agent_listener) {
  while (!stop_requested) {
    const int client = accept(listener, nullptr, nullptr);
    if (client < 0) {
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
      continue;
    }
    const timeval timeout{5, 0};
    setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    std::thread([client, agent_listener]() { handle_client(client, agent_listener); }).detach();
  }
}

int main(int argc, char** argv) {
  if (argc == 2 && std::string(argv[1]) == "--init-db") {
    try {
      initialize_database();
      std::cout << "Panel database ready\n";
      return 0;
    } catch (const std::exception& error) {
      std::cerr << "Panel database: " << error.what() << '\n';
      return 1;
    }
  }
  if (argc != 4) {
    std::cerr << "usage: panel-server <admin-port> <agent-port> <dist-directory>\n";
    return 2;
  }
  listen_port = std::stoi(argv[1]);
  agent_port = std::stoi(argv[2]);
  if (listen_port < 1 || listen_port > 65535 || agent_port < 1 || agent_port > 65535 ||
      listen_port == agent_port) return 2;
  dist_dir = fs::absolute(argv[3]);
  std::signal(SIGPIPE, SIG_IGN);
  std::signal(SIGINT, [](int) { stop_requested = 1; });
  std::signal(SIGTERM, [](int) { stop_requested = 1; });
  curl_global_init(CURL_GLOBAL_DEFAULT);
  try {
    initialize_database();
    const auto key_rows = database->query("SELECT value FROM public.panel_settings WHERE key = 'agent_key'");
    if (key_rows.size() != 1 || key_rows[0].size() != 1 || key_rows[0][0].size() != 64) {
      throw std::runtime_error("agent key is missing or invalid");
    }
    agent_key = key_rows[0][0];
  } catch (const std::exception& error) {
    std::cerr << "Panel database: " << error.what() << '\n';
    return 1;
  }
  append_log("main", "INFO", "Panel server started", "Сервер панелі запущено");
  append_log("creds", "INFO", "Panel account loaded from PostgreSQL", "Обліковий запис панелі завантажено з PostgreSQL");
  append_log("tasks", "INFO", "Task service is not connected", "Сервіс завдань не підключено");
  append_log("agents", "INFO", "Agent pull is not implemented", "Pull агентів не реалізовано");
  append_log("connect", "INFO", "External port check is pending", "Зовнішня перевірка порту очікується");

  admin_socket = make_listener(listen_port, INADDR_LOOPBACK);
  if (admin_socket < 0) return 1;
  agent_socket = make_listener(agent_port, INADDR_ANY);
  if (agent_socket < 0) {
    close(admin_socket);
    return 1;
  }
  std::cout << "Panel listening on http://127.0.0.1:" << listen_port
            << "; agent endpoint on port " << agent_port << std::endl;
  std::thread agent_worker([]() { accept_clients(agent_socket, true); });
  std::thread connection_worker(manage_connection);
  accept_clients(admin_socket, false);
  agent_worker.join();
  connection_worker.join();
  close(agent_socket);
  close(admin_socket);
  return 0;
}
