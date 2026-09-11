param([int]$Port = 3000)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Choose a port between 1024 and 65535.' }
$projectDirectory = Split-Path -Parent $PSScriptRoot
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$nextExecutable = Join-Path $projectDirectory 'node_modules/next/dist/bin/next'
if (-not (Test-Path -LiteralPath $nextExecutable)) { throw 'Install the project dependencies first.' }
$logDirectory = Join-Path $projectDirectory 'artifacts/local-server'
$connectionProbe = [System.Net.Sockets.TcpClient]::new()
$portInUse = $false
try { $connectionProbe.Connect('127.0.0.1', $Port); $portInUse = $true } catch {} finally { $connectionProbe.Dispose() }
if ($portInUse) { throw "Port $Port is already in use. Open the existing server or choose -Port 3001." }
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList @(
    ('"' + $nextExecutable + '"'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', "$Port"
) -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $logDirectory "next-$Port.log") `
  -RedirectStandardError (Join-Path $logDirectory "next-$Port.error.log")
Start-Sleep -Seconds 2
$serverProcess.Refresh()
if ($serverProcess.HasExited) { throw "Server exited during startup. Check $logDirectory." }
[PSCustomObject]@{ ProcessId=$serverProcess.Id; Url="http://127.0.0.1:$Port/analytics"; Logs=$logDirectory } | ConvertTo-Json
