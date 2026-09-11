param([Parameter(Mandatory = $true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$sourceDirectory = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$destinationDirectory = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $destinationDirectory) { throw 'Choose a new, nonexistent destination. Nothing will be overwritten.' }
if ($destinationDirectory.StartsWith($sourceDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The fresh repository must be outside the source project.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required for the author checks.' }
# Export the current working files, including uncommitted edits and new source files.
# Never copy .git/history, ignored dependencies, private environment files or artifacts.
$rawFiles = (& git -C $sourceDirectory ls-files --cached --others --exclude-standard -z) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'Could not enumerate project source files.' }
$sourceFiles = $rawFiles.Split([char]0, [StringSplitOptions]::RemoveEmptyEntries) | Sort-Object -Unique
$exportFiles = foreach ($relativePath in $sourceFiles) {
    $normalPath = $relativePath.Replace('\', '/')
    if ($normalPath -match '(^|/)(\.git|node_modules|\.next|\.venv|artifacts|__pycache__)(/|$)') { continue }
    if ([IO.Path]::GetFileName($normalPath) -like '.env*' -and [IO.Path]::GetFileName($normalPath) -ne '.env.example') { continue }
    $sourcePath = [IO.Path]::GetFullPath((Join-Path $sourceDirectory $relativePath))
    if (-not $sourcePath.StartsWith($sourceDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Unsafe source path.'
    }
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { continue }
    if ((Get-Item -LiteralPath $sourcePath).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Review symbolic link before exporting: $relativePath"
    }
    $relativePath
}
New-Item -ItemType Directory -Path $destinationDirectory | Out-Null
foreach ($relativePath in $exportFiles) {
    $targetPath = [IO.Path]::GetFullPath((Join-Path $destinationDirectory $relativePath))
    if (-not $targetPath.StartsWith($destinationDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Unsafe destination path.'
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $targetPath) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceDirectory $relativePath) -Destination $targetPath
}
& git -C $destinationDirectory init --initial-branch=main
if ($LASTEXITCODE -ne 0) { throw 'Fresh Git initialization failed.' }
& (Join-Path $destinationDirectory 'scripts/configure-owner.ps1')
$initialRefs = & git -C $destinationDirectory for-each-ref --format='%(refname)'
if ($LASTEXITCODE -ne 0 -or $initialRefs) { throw 'Unexpected history or unreadable refs in the fresh repository.' }
$global:LASTEXITCODE = 0
Write-Output "Fresh repository prepared: $destinationDirectory"
Write-Output 'No old commits, remote, initial commit or push were created. Your first normal commit will be authored by Zubair Ahmad.'
Write-Output 'The original repository is untouched. Inspect the copied files before publishing; ignored local data and credentials were excluded.'
