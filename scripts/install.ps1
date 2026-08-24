# dsh-plugin-balance — Windows install script (one-command install)
# Copies this plugin into the DSH profile's hoisted node_modules and enables
# it in the profile's cordis.patch.yml. Requires a DSH restart (or the patch
# HMR to pick the change up) before the plugin activates.
#
# Usage — from a local checkout:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -ProfileName headless
#
# Usage — remote one-command install (downloads the release ZIP automatically):
#   irm https://raw.githubusercontent.com/anonRTtty/dsh-plugin-balance/main/scripts/install.ps1 | iex
param(
    [string]$ProfileName = "web",
    [string]$RepoUrl = "https://github.com/anonRTtty/dsh-plugin-balance"
)

$ErrorActionPreference = "Stop"
$TAG = "v0.1.0"

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME ".dsh" }
$profilesNodeModules = Join-Path $dshHome "profiles\node_modules"
$profileDir = Join-Path $dshHome ("profiles\" + $ProfileName)
$dest = Join-Path $profilesNodeModules "dsh-plugin-balance"
$patchFile = Join-Path $profileDir "cordis.patch.yml"

Write-Host "==> dsh-plugin-balance installer" -ForegroundColor Cyan
Write-Host "    DSH home      : $dshHome"
Write-Host "    Profile       : $ProfileName"
Write-Host "    Plugin target : $dest"
Write-Host "    Patch file    : $patchFile"

if (-not (Test-Path $profileDir)) {
    Write-Error "Profile directory not found: $profileDir"
}
if (-not (Test-Path $profilesNodeModules)) {
    Write-Error "Profiles node_modules not found: $profilesNodeModules (is DSH installed?)"
}

# 0) source of the plugin files: local checkout, or download the release ZIP
if (-not [string]::IsNullOrEmpty($PSScriptRoot)) {
    $src = Split-Path -Parent $PSScriptRoot   # repo root
    Write-Host "    Source        : $src (local checkout)"
} else {
    Write-Host "==> Downloading dsh-plugin-balance $TAG ..." -ForegroundColor Cyan
    $zipUrl = "$RepoUrl/archive/refs/tags/$TAG.zip"
    $tmpZip = Join-Path $env:TEMP "dsh-plugin-balance-$TAG.zip"
    $tmpDir = Join-Path $env:TEMP "dsh-plugin-balance-$TAG"
    Invoke-WebRequest -Uri $zipUrl -OutFile $tmpZip
    if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpDir
    $src = (Get-ChildItem $tmpDir -Directory | Select-Object -First 1).FullName
    Write-Host "    Source        : $src (downloaded)"
}

# 1) copy the plugin package
Write-Host "==> Copying plugin files..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($item in @("package.json", "cordis.patch.yml", "src", "LICENSE", "README.md", "screenshot.png", "scripts")) {
    $itemPath = Join-Path $src $item
    if (Test-Path $itemPath) {
        Copy-Item -Path $itemPath -Destination $dest -Recurse -Force
        Write-Host "    copied $item"
    }
}

# 2) enable it in cordis.patch.yml (backup first, idempotent)
Write-Host "==> Enabling plugin in $patchFile ..." -ForegroundColor Cyan
$backup = "$patchFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -Path $patchFile -Destination $backup -Force
Write-Host "    backup: $backup"

$content = Get-Content -Path $patchFile -Raw -Encoding UTF8
if ($content -match "dsh-plugin-balance") {
    Write-Host "    already enabled, nothing to change" -ForegroundColor Yellow
} else {
    $entry = @"

- insert:
    - id: dsh-plugin-balance
      name: dsh-plugin-balance
"@
    $trimmed = $content.TrimEnd()
    # "Empty" means: after stripping comments/blank lines there are no real
    # entries, or the only entry is the empty-array marker "[]".
    $meaningful = @($content -split "\r?\n" | Where-Object {
        $t = $_.Trim()
        $t -ne "" -and -not $t.StartsWith("#")
    })
    $isEmpty = ($meaningful.Count -eq 0) -or ($meaningful.Count -eq 1 -and $meaningful[0].Trim() -eq "[]")
    if ($isEmpty) {
        # fresh/empty patch file: write the canonical form with comments
        $new = @"
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; ``!!js`` expressions allowed).
$entry
"@
    } else {
        # append to existing entries
        $new = $trimmed + "`n" + $entry + "`n"
    }
    Set-Content -Path $patchFile -Value $new -Encoding UTF8 -NoNewline
    Write-Host "    enabled (insert added)"
}

Write-Host "==> Done." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Restart DSH (or let the patch HMR re-compose the config)."
Write-Host "  2. Hard-refresh the browser (Ctrl+Shift+R)."
Write-Host "  3. Look for the '余额：xx.xx ↻' capsule at the top-right of the session header, next to 'Session log'."
