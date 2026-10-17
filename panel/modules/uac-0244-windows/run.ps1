param([string]$WorkDir)
$ErrorActionPreference = 'Stop'
$missing = @('mshta.exe','cmd.exe','Register-ScheduledTask') | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) }
if (@($missing).Count -gt 0) {
  @{ preflight = @{ ok = $false; missing = ($missing -join ',') } } |
    ConvertTo-Json -Compress -Depth 4 | Set-Content -LiteralPath (Join-Path $WorkDir 'result.json') -Encoding ASCII
  return
}
Start-LabStep 'shortcut'
$phases = [ordered]@{ shortcut = $false; hta = $false; task = $false; loader = $false }
$metrics = [ordered]@{}

function Start-LabPowerShell([string]$Path, [string]$Value = 'CERTUA_LAB') {
  $code = "[IO.File]::WriteAllText('$($Path.Replace("'","''"))','$($Value.Replace("'","''"))')"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code))
  $process = Start-Process -FilePath (Get-Command powershell.exe).Source -ArgumentList "-NoProfile -EncodedCommand $encoded" -WindowStyle Hidden -PassThru -Wait
  return $process.ExitCode -eq 0 -and (Test-Path -LiteralPath $Path)
}
function Start-LabCmd([string]$Exe, [string]$Marker) {
  $process = Start-Process -FilePath $Exe -ArgumentList ('/c echo CERTUA_LAB>"' + $Marker + '"') -WindowStyle Hidden -PassThru -Wait
  return $process.ExitCode -eq 0 -and (Test-Path -LiteralPath $Marker)
}
function Start-LabTask([string]$Name, [string]$Marker) {
  $code = "[IO.File]::WriteAllText('$($Marker.Replace("'","''"))','CERTUA_LAB')"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code))
  $action = New-ScheduledTaskAction -Execute (Get-Command powershell.exe).Source -Argument "-NoProfile -EncodedCommand $encoded"
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5)
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  try {
    Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Start-ScheduledTask -TaskName $Name
    for ($i = 0; $i -lt 25 -and -not (Test-Path -LiteralPath $Marker); $i++) { Start-Sleep -Milliseconds 200 }
    return Test-Path -LiteralPath $Marker
  } finally {
    Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
  }
}
function Start-LabVbs([string]$ScriptPath, [string]$Marker) {
  @('Set fso = CreateObject("Scripting.FileSystemObject")',
    ('Set output = fso.CreateTextFile("' + $Marker.Replace('"','""') + '", True)'),
    'output.WriteLine "CERTUA_LAB"', 'output.Close') |
    Set-Content -LiteralPath $ScriptPath -Encoding ASCII
  $process = Start-Process -FilePath (Get-Command cscript.exe).Source -ArgumentList ('//B //Nologo "' + $ScriptPath + '"') -WindowStyle Hidden -PassThru -Wait
  return $process.ExitCode -eq 0 -and (Test-Path -LiteralPath $Marker)
}
function Start-LabHta([string]$HtaPath, [string]$Marker) {
  $jsPath = $Marker.Replace('\','\\').Replace("'","\'")
  $page = '<html><head><HTA:APPLICATION SHOWINTASKBAR="no" WINDOWSTATE="minimize" /></head><script>' +
    "var fso=new ActiveXObject('Scripting.FileSystemObject'); var f=fso.CreateTextFile('$jsPath',true); f.WriteLine('CERTUA_LAB'); f.Close(); window.close();" +
    '</script></html>'
  [IO.File]::WriteAllText($HtaPath, $page, [Text.Encoding]::ASCII)
  $process = Start-Process -FilePath (Get-Command mshta.exe).Source -ArgumentList ('"' + $HtaPath + '"') -WindowStyle Hidden -PassThru
  try {
    for ($i = 0; $i -lt 25 -and -not (Test-Path -LiteralPath $Marker); $i++) { Start-Sleep -Milliseconds 200 }
    return Test-Path -LiteralPath $Marker
  } finally {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  }
}
function Invoke-LabLoopback([string]$Payload, [string]$Mode = 'POST') {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $client = $null
  $server = $null
  try {
    $port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
    $client = [Net.Sockets.TcpClient]::new()
    $client.Connect('127.0.0.1', $port)
    if ($Mode -eq 'WebSocket') {
      $request = "GET /lab HTTP/1.1`r`nHost: 127.0.0.1:$port`r`nUpgrade: websocket`r`nConnection: Upgrade`r`nSec-WebSocket-Key: AQIDBAUGBwgJCgsMDQ4PEA==`r`nSec-WebSocket-Version: 13`r`n`r`n"
    } else {
      $size = [Text.Encoding]::UTF8.GetByteCount($Payload)
      $request = "POST /lab HTTP/1.1`r`nHost: 127.0.0.1:$port`r`nContent-Length: $size`r`nConnection: close`r`n`r`n$Payload"
    }
    $sent = [Text.Encoding]::UTF8.GetBytes($request)
    $client.GetStream().Write($sent, 0, $sent.Length)
    $server = $listener.AcceptTcpClient()
    $stream = $server.GetStream()
    $stream.ReadTimeout = 2000
    $buffer = New-Object byte[] 4096
    $count = $stream.Read($buffer, 0, $buffer.Length)
    $received = [Text.Encoding]::UTF8.GetString($buffer, 0, $count)
    if ($Mode -eq 'WebSocket') {
      $key = 'AQIDBAUGBwgJCgsMDQ4PEA=='
      $digest = [Security.Cryptography.SHA1]::Create().ComputeHash([Text.Encoding]::ASCII.GetBytes($key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'))
      $accept = [Convert]::ToBase64String($digest)
      $reply = "HTTP/1.1 101 Switching Protocols`r`nUpgrade: websocket`r`nConnection: Upgrade`r`nSec-WebSocket-Accept: $accept`r`n`r`n"
      $valid = $received.Contains('Upgrade: websocket') -and $received.Contains("Sec-WebSocket-Key: $key")
    } else {
      $reply = "HTTP/1.1 200 OK`r`nContent-Length: 2`r`nConnection: close`r`n`r`nOK"
      $valid = $received.Contains($Payload)
    }
    $bytes = [Text.Encoding]::ASCII.GetBytes($reply)
    $stream.Write($bytes, 0, $bytes.Length)
    $responseBuffer = New-Object byte[] 512
    $client.GetStream().ReadTimeout = 2000
    $responseCount = $client.GetStream().Read($responseBuffer, 0, $responseBuffer.Length)
    $response = [Text.Encoding]::ASCII.GetString($responseBuffer, 0, $responseCount)
    if ($Mode -eq 'WebSocket') { return $valid -and $response.Contains("Sec-WebSocket-Accept: $accept") }
    return $valid -and $response.StartsWith('HTTP/1.1 200 OK')
  } finally {
    if ($server) { $server.Close() }
    if ($client) { $client.Close() }
    $listener.Stop()
  }
}

$runError = ''
try {

  $hta = Join-Path $WorkDir 'aid.hta'
  $marker = Join-Path $WorkDir 'hta-marker.txt'
  $lnk = Join-Path $WorkDir 'aid-documents.lnk'
  $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
  $shortcut.TargetPath = (Get-Command mshta.exe).Source
  $shortcut.Arguments = '"' + $hta + '"'
  $shortcut.Save()
  $phases.shortcut = Test-Path $lnk
  Finish-LabStep 'shortcut' $phases.shortcut
  Start-LabStep 'hta'
  $jsPath = $marker.Replace('\','\\').Replace("'","\'")
  $page = '<html><head><HTA:APPLICATION SHOWINTASKBAR="no" WINDOWSTATE="minimize" /></head><script>' +
    "var fso=new ActiveXObject('Scripting.FileSystemObject'); var f=fso.CreateTextFile('$jsPath',true); f.WriteLine('CERTUA_LAB'); f.Close(); window.close();" +
    '</script></html>'
  [IO.File]::WriteAllText($hta, $page, [Text.Encoding]::ASCII)
  Invoke-Item -LiteralPath $lnk
  for ($i = 0; $i -lt 25 -and -not (Test-Path -LiteralPath $marker); $i++) { Start-Sleep -Milliseconds 200 }
  $phases.hta = Test-Path -LiteralPath $marker
  Finish-LabStep 'hta' $phases.hta
  Start-LabStep 'task'
  $taskName = 'CertUaLab-AgingFly-' + [guid]::NewGuid().ToString('N')
  $phases.task = Start-LabTask $taskName (Join-Path $WorkDir 'task-marker.txt')
  Finish-LabStep 'task' $phases.task
  Start-LabStep 'loader'
  $loader = Join-Path $WorkDir 'AGINGFLY-inert.exe'
  Copy-Item -LiteralPath (Get-Command cmd.exe).Source -Destination $loader
  $phases.loader = Start-LabCmd $loader (Join-Path $WorkDir 'loader-marker.txt')
  Finish-LabStep 'loader' $phases.loader
  $metrics.foreignProcessesInjected = 0
  $metrics.externalRequests = 0

} catch {
  $runError = $_.Exception.Message
}
if ($runError) { $metrics.error = $runError.Substring(0, [Math]::Min(160, $runError.Length)) }
@{ phases = $phases; metrics = $metrics } | ConvertTo-Json -Compress -Depth 5 |
  Set-Content -LiteralPath (Join-Path $WorkDir 'result.json') -Encoding ASCII
