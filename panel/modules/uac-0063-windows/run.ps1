param([string]$WorkDir)
$ErrorActionPreference = 'Stop'
$missing = @('mshta.exe','python.exe','Register-ScheduledTask') | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) }
if ($missing.Count) {
  @{ preflight = @{ ok = $false; missing = ($missing -join ',') } } | ConvertTo-Json -Compress -Depth 4 | Set-Content -LiteralPath (Join-Path $WorkDir 'result.json') -Encoding ASCII
  return
}
$taskName = 'CertUaLab-' + [guid]::NewGuid().ToString('N')
$hta = Join-Path $WorkDir 'RecordsService.hta'
$marker = Join-Path $WorkDir 'hta-marker.txt'
$scriptMarker = $marker.Replace('\','\\')
@"
<html><head><HTA:APPLICATION SHOWINTASKBAR="no" WINDOWSTATE="minimize" /></head><script>
var fso = new ActiveXObject('Scripting.FileSystemObject');
var out = fso.CreateTextFile('$scriptMarker', true); out.WriteLine('CERTUA_LAB'); out.Close(); window.close();
</script></html>
"@ | Set-Content -LiteralPath $hta -Encoding ASCII
$phases = @{ hta = (Test-Path -LiteralPath $hta); task = $false; python = $false }
try {
  $action = New-ScheduledTaskAction -Execute (Get-Command mshta.exe).Source -Argument ('"' + $hta + '"')
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5)
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  for ($i=0; $i -lt 30 -and -not (Test-Path -LiteralPath $marker); $i++) { Start-Sleep -Milliseconds 200 }
  $phases.task = Test-Path -LiteralPath $marker
} finally {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}
$stage = Join-Path $WorkDir 'cherryspy-lab.py'
$pythonMarker = Join-Path $WorkDir 'python-marker.txt'
@'
import pathlib, sys
pathlib.Path(sys.argv[1]).write_text('CERTUA_LAB')
'@ | Set-Content -LiteralPath $stage -Encoding ASCII
& (Get-Command python.exe).Source $stage $pythonMarker
$phases.python = (Test-Path -LiteralPath $pythonMarker) -and ((Get-Content -LiteralPath $pythonMarker -Raw).Trim() -eq 'CERTUA_LAB')
@{ phases = $phases; metrics = @{ htaLaunched = $phases.task; pythonStage = $phases.python; externalRequests = 0 } } |
  ConvertTo-Json -Compress -Depth 5 | Set-Content -LiteralPath (Join-Path $WorkDir 'result.json') -Encoding ASCII
