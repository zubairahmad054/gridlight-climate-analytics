$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$testDestination = Join-Path ([IO.Path]::GetTempPath()) ('carbon-fresh-owner-' + [guid]::NewGuid().ToString('N'))
$originalHead = & git -C $projectDirectory rev-parse HEAD
& (Join-Path $projectDirectory 'scripts/new-owner-repository.ps1') -Destination $testDestination
if (Test-Path -LiteralPath (Join-Path $testDestination '.env.local')) { throw 'Private environment file was copied.' }
if (Test-Path -LiteralPath (Join-Path $testDestination 'artifacts')) { throw 'Local artifacts were copied.' }
& git -C $testDestination add --all
if ($LASTEXITCODE -ne 0) { throw 'Test staging failed.' }
& git -C $testDestination -c commit.gpgsign=false commit -m 'Initial project snapshot'
if ($LASTEXITCODE -ne 0) { throw 'Initial test commit failed.' }
$author = & git -C $testDestination log -1 '--format=%an <%ae>'
if ($author -ne 'Zubair Ahmad <m.zubairahmad054@gmail.com>') { throw "Unexpected author: $author" }
if ((& git -C $testDestination rev-list --count HEAD) -ne '1') { throw 'Old history was carried over.' }
if ((& git -C $testDestination log -1 --format=%B) -match '(?i)co-authored-by:') { throw 'Unexpected co-author credit.' }
if ((& git -C $projectDirectory rev-parse HEAD) -ne $originalHead) { throw 'Original history changed.' }
Write-Output "PASS: one fresh commit, sole author Zubair Ahmad, no old history or co-author. Test copy retained at $testDestination"
