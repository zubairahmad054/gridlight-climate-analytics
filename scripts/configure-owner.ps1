$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$gitRoot = & git -C $projectDirectory rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($gitRoot) -ne [IO.Path]::GetFullPath($projectDirectory)) {
    throw 'Initialize Git in this project folder first. Refusing to configure a parent repository.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required for the author checks.' }
foreach ($hookName in @('author-policy.mjs', 'pre-commit', 'prepare-commit-msg', 'commit-msg', 'pre-push')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory ".githooks/$hookName"))) {
        throw "Missing author protection file: $hookName"
    }
}
$ownerSettings = [ordered]@{
    'user.name' = 'Zubair Ahmad'
    'user.email' = 'm.zubairahmad054@gmail.com'
    'author.name' = 'Zubair Ahmad'
    'author.email' = 'm.zubairahmad054@gmail.com'
    'committer.name' = 'Zubair Ahmad'
    'committer.email' = 'm.zubairahmad054@gmail.com'
    'user.useConfigOnly' = 'true'
    'core.hooksPath' = '.githooks'
}
foreach ($setting in $ownerSettings.GetEnumerator()) {
    & git -C $projectDirectory config --local $setting.Key $setting.Value
    if ($LASTEXITCODE -ne 0) { throw "Could not configure $($setting.Key)" }
}
& git -C $projectDirectory hook run pre-commit
if ($LASTEXITCODE -ne 0) { throw 'Effective Git identity failed verification. Check environment overrides.' }
Write-Output 'Verified: author and committer are Zubair Ahmad; owner-only hooks enabled.'
