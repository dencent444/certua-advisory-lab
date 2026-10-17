param([string]$WorkDir)
$ErrorActionPreference = 'Stop'
$missing = @('powershell.exe', 'cmd.exe', 'curl.exe', 'ssh-keygen.exe') |
  Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) }
if (@($missing).Count -gt 0) {
  @{ preflight = @{ ok = $false; missing = ($missing -join ',') } } |
    ConvertTo-Json -Compress -Depth 4 |
    Set-Content -LiteralPath (Join-Path $WorkDir 'result.json') -Encoding ASCII
  return
}
Start-LabStep 'lure'
$phases = [ordered]@{ lure = $false; powershell = $false; key = $false; upload = $false; tor = $false }
$metrics = [ordered]@{ externalRequests = 0; privateKeyUploaded = $false; opensshServiceChanged = $false; torStarted = $false }
$runError = ''
$listener = $null
$server = $null
$process = $null

try {
  $lure = Join-Path $WorkDir 'ArmyPlusInstaller-v.0.10.23722.exe'
  $lureMarker = Join-Path $WorkDir 'lure-marker.txt'
  [IO.File]::Copy((Get-Command cmd.exe).Source, $lure)
  $lureProcess = Start-Process -FilePath $lure -ArgumentList ('/d /c echo CERTUA_LAB>"' + $lureMarker + '"') -WindowStyle Hidden -PassThru -Wait
  $phases.lure = $lureProcess.ExitCode -eq 0 -and (Test-Path -LiteralPath $lureMarker)
  Finish-LabStep 'lure' $phases.lure
  Start-LabStep 'powershell'

  $marker = Join-Path $WorkDir 'init-marker.txt'
  $code = "[IO.File]::WriteAllText('$($marker.Replace("'", "''"))','CERTUA_LAB_INIT')"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code))
  $shell = Start-Process -FilePath (Get-Command powershell.exe).Source -ArgumentList "-NoProfile -EncodedCommand $encoded" -WindowStyle Hidden -PassThru -Wait
  $phases.powershell = $shell.ExitCode -eq 0 -and (Test-Path -LiteralPath $marker)
  Finish-LabStep 'powershell' $phases.powershell
  Start-LabStep 'key'

  $private = Join-Path $WorkDir 'lab_rsa'
  $public = "$private.pub"
  $keygen = Start-Process -FilePath (Get-Command ssh-keygen.exe).Source -ArgumentList ('-q -t rsa -b 2048 -N CERTUA_LAB -f "' + $private + '"') -WindowStyle Hidden -PassThru -Wait
  $mockSsh = Join-Path $WorkDir 'mock-ssh'
  New-Item -ItemType Directory -Path $mockSsh -Force | Out-Null
  $authorized = Join-Path $mockSsh 'authorized_keys'
  if (Test-Path -LiteralPath $public) { Copy-Item -LiteralPath $public -Destination $authorized }
  $phases.key = $keygen.ExitCode -eq 0 -and (Test-Path -LiteralPath $private) -and
    (Test-Path -LiteralPath $authorized) -and
    ((Get-Content -LiteralPath $authorized -Raw).StartsWith('ssh-rsa '))
  Finish-LabStep 'key' $phases.key
  Start-LabStep 'upload'

  if ($phases.key) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
    $curlArgs = '--fail --silent --show-error --noproxy "*" --data-binary "@' + $public +
      '" "http://127.0.0.1:' + $port + '/lab-key"'
    $process = Start-Process -FilePath (Get-Command curl.exe).Source -ArgumentList $curlArgs -WindowStyle Hidden -PassThru
    $pending = $listener.AcceptTcpClientAsync()
    if (-not $pending.Wait(8000)) { throw 'curl did not request the loopback listener' }
    $server = $pending.Result
    $stream = $server.GetStream()
    $stream.ReadTimeout = 3000
    $buffer = New-Object byte[] 4096
    $count = $stream.Read($buffer, 0, $buffer.Length)
    $request = [Text.Encoding]::ASCII.GetString($buffer, 0, $count)
    if (-not $request.StartsWith('POST /lab-key HTTP/')) { throw 'Unexpected key request' }
    $reply = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 204 No Content`r`nContent-Length: 0`r`nConnection: close`r`n`r`n")
    $stream.Write($reply, 0, $reply.Length)
    $server.Close()
    $server = $null
    if (-not $process.WaitForExit(8000)) { throw 'curl did not finish' }
    $phases.upload = $process.ExitCode -eq 0
  }
  Finish-LabStep 'upload' $phases.upload
  Start-LabStep 'tor'

  $tor = Join-Path $WorkDir 'torrc.lab'
  $torDir = Join-Path $WorkDir 'hidden-service'
  [IO.File]::WriteAllText($tor, "HiddenServiceDir $torDir`nHiddenServicePort 22 127.0.0.1:9`n")
  $phases.tor = (Get-Content -LiteralPath $tor -Raw).Contains('HiddenServicePort 22 127.0.0.1:9')
  Finish-LabStep 'tor' $phases.tor
} catch {
  $runError = $_.Exception.Message
} finally {
  if ($server) { $server.Close() }
  if ($listener) { $listener.Stop() }
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
}
if ($runError) { $metrics.error = $runError.Substring(0, [Math]::Min(160, $runError.Length)) }
@{ phases = $phases; metrics = $metrics } | ConvertTo-Json -Compress -Depth 5 |
  Set-Content -LiteralPath (Join-Path $WorkDir 'result.json') -Encoding ASCII
