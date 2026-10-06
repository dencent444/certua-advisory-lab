param([string]$WorkDir)
$ErrorActionPreference = 'Stop'
$missing = @('wscript.exe','Register-ScheduledTask','Compress-Archive') | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) }
if ($missing.Count) {
  @{ preflight = @{ ok = $false; missing = ($missing -join ',') } } | ConvertTo-Json -Compress -Depth 4 | Set-Content -LiteralPath (Join-Path $WorkDir 'result.json') -Encoding ASCII
  return
}
$taskName = 'CertUaLab-' + [guid]::NewGuid().ToString('N')
$scriptPath = Join-Path $WorkDir 'gammaload-lab.vbs'
$marker = Join-Path $WorkDir 'script-host.txt'
$escapedMarker = $marker.Replace('"','""')
@('Set fso = CreateObject("Scripting.FileSystemObject")', ('Set file = fso.CreateTextFile("' + $escapedMarker + '", True)'), 'file.WriteLine "CERTUA_LAB"', 'file.Close') | Set-Content -LiteralPath $scriptPath -Encoding ASCII
$phases = @{ script = (Test-Path -LiteralPath $scriptPath); task = $false; collect = $false; archive = $false }
try {
  $action = New-ScheduledTaskAction -Execute (Get-Command wscript.exe).Source -Argument ('//B //Nologo "' + $scriptPath + '"')
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5)
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  for ($i=0; $i -lt 30 -and -not (Test-Path -LiteralPath $marker); $i++) { Start-Sleep -Milliseconds 200 }
  $phases.task = Test-Path -LiteralPath $marker
} finally {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}
$source = Join-Path $WorkDir 'decoy-documents'
New-Item -ItemType Directory -Path $source -Force | Out-Null
'LAB DOCUMENT' | Set-Content -LiteralPath (Join-Path $source 'brief.docx') -Encoding ASCII
'LAB SHEET' | Set-Content -LiteralPath (Join-Path $source 'budget.xlsx') -Encoding ASCII
'LAB NOTE' | Set-Content -LiteralPath (Join-Path $source 'note.txt') -Encoding ASCII
$selected = @(Get-ChildItem -LiteralPath $source -File | Where-Object { $_.Extension -in @('.docx','.xlsx','.txt') })
$phases.collect = $selected.Count -eq 3
$archive = Join-Path $WorkDir 'staging.zip'
Compress-Archive -LiteralPath $selected.FullName -DestinationPath $archive -Force
$phases.archive = Test-Path -LiteralPath $archive
@{ phases = $phases; metrics = @{ decoyFiles = $selected.Count; archiveBytes = (Get-Item -LiteralPath $archive).Length; realFilesRead = 0 } } |
  ConvertTo-Json -Compress -Depth 5 | Set-Content -LiteralPath (Join-Path $WorkDir 'result.json') -Encoding ASCII
