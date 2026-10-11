param([string]$WorkDir)
$ErrorActionPreference = 'Stop'
$missing = @('powershell.exe', 'cmd.exe', 'curl.exe', 'msiexec.exe') |
  Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) }
if (@($missing).Count -gt 0) {
  @{ preflight = @{ ok = $false; missing = ($missing -join ',') } } |
    ConvertTo-Json -Compress -Depth 4 |
    Set-Content -LiteralPath (Join-Path $WorkDir 'result.json') -Encoding ASCII
  return
}
$phases = [ordered]@{ lure = $false; xor = $false; bat = $false; msi = $false }
$metrics = [ordered]@{ externalRequests = 0; ateraInstalled = $false }
$runError = ''
$listener = $null
$server = $null
$process = $null

try {
  $pdf = Join-Path $WorkDir 'procurement.pdf'
  $zip = Join-Path $WorkDir 'procurement.zip'
  [IO.File]::WriteAllText($pdf, "%PDF-1.4`n% CERTUA_LAB_PROCUREMENT_DECOY`n")
  Compress-Archive -LiteralPath $pdf -DestinationPath $zip -Force
  $phases.lure = (Test-Path -LiteralPath $pdf) -and (Test-Path -LiteralPath $zip)

  $key = New-Object byte[] 128
  for ($i = 0; $i -lt $key.Length; $i++) { $key[$i] = [byte](($i * 73 + 19) -band 255) }
  $plain = [Text.Encoding]::ASCII.GetBytes("print('CERTUA_LAB_DROPCLUE')")
  $encoded = New-Object byte[] $plain.Length
  for ($i = 0; $i -lt $plain.Length; $i++) { $encoded[$i] = [byte]($plain[$i] -bxor $key[$i % $key.Length]) }
  $blob = Join-Path $WorkDir 'code1.lua.xor'
  $decoded = Join-Path $WorkDir 'code1.lua'
  [IO.File]::WriteAllBytes($blob, $encoded)
  $readback = [IO.File]::ReadAllBytes($blob)
  for ($i = 0; $i -lt $readback.Length; $i++) { $readback[$i] = [byte]($readback[$i] -bxor $key[$i % $key.Length]) }
  [IO.File]::WriteAllBytes($decoded, $readback)
  $phases.xor = [Text.Encoding]::ASCII.GetString($readback) -eq "print('CERTUA_LAB_DROPCLUE')"
  $metrics.xorKeyBytes = $key.Length

  $fixture = [Text.Encoding]::ASCII.GetBytes('CERTUA_LAB_NOT_AN_INSTALLABLE_MSI')
  $downloaded = Join-Path $WorkDir 'setup.msi'
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
  $bat = Join-Path $WorkDir 'font-pack-pdf-windows-64-bit.bat'
  $curl = (Get-Command curl.exe).Source
  $batText = '@echo off' + "`r`n" + '"' + $curl + '" --fail --silent --show-error --noproxy "*" --output "' +
    $downloaded + '" "http://127.0.0.1:' + $port + '/setup.msi"' + "`r`n"
  [IO.File]::WriteAllText($bat, $batText, [Text.Encoding]::ASCII)
  $process = Start-Process -FilePath (Get-Command cmd.exe).Source -ArgumentList ('/d /s /c ""' + $bat + '""') -WindowStyle Hidden -PassThru
  $pending = $listener.AcceptTcpClientAsync()
  if (-not $pending.Wait(8000)) { throw 'BAT did not request the loopback fixture' }
  $server = $pending.Result
  $stream = $server.GetStream()
  $stream.ReadTimeout = 3000
  $buffer = New-Object byte[] 4096
  $count = $stream.Read($buffer, 0, $buffer.Length)
  $request = [Text.Encoding]::ASCII.GetString($buffer, 0, $count)
  if (-not $request.StartsWith('GET /setup.msi HTTP/')) { throw 'Unexpected fixture request' }
  $header = "HTTP/1.1 200 OK`r`nContent-Type: application/octet-stream`r`nContent-Length: $($fixture.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  $stream.Write($fixture, 0, $fixture.Length)
  $server.Close()
  $server = $null
  if (-not $process.WaitForExit(8000)) { throw 'BAT did not finish' }
  $phases.bat = $process.ExitCode -eq 0 -and (Test-Path -LiteralPath $downloaded) -and
    ([Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($downloaded)) -eq
      [Text.Encoding]::ASCII.GetString($fixture))
  $metrics.loopbackDownloads = [int]$phases.bat

  if ($phases.bat) {
    $installer = Start-Process -FilePath (Get-Command msiexec.exe).Source -ArgumentList ('/i "' + $downloaded + '" /qn /norestart') -WindowStyle Hidden -PassThru
    try {
      if (-not $installer.WaitForExit(10000)) { throw 'msiexec did not finish' }
      $metrics.installerExitCode = $installer.ExitCode
      $phases.msi = $installer.ExitCode -ne 0
    } finally {
      if (-not $installer.HasExited) { Stop-Process -Id $installer.Id -Force -ErrorAction SilentlyContinue }
    }
  }
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
