#Requires -Version 7
# .claude/scripts/install-hooks.ps1
# Installs the git pre-commit hook for this repo.
# Run once per checkout: .\.claude\scripts\install-hooks.ps1

$repoRoot  = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$hooksDir  = Join-Path $repoRoot '.git\hooks'
$hookFile  = Join-Path $hooksDir 'pre-commit'

$content = @'
#!/usr/bin/env sh
# Calls the tracked PowerShell pre-commit script.
# Re-install with: .claude/scripts/install-hooks.ps1
exec powershell.exe -NonInteractive -NoProfile -File ".claude/hooks/pre-commit.ps1"
'@

if (-not (Test-Path $hooksDir)) {
    Write-Host "[install-hooks] .git/hooks not found. Are you in the repo root?" -ForegroundColor Red
    exit 1
}

Set-Content -Path $hookFile -Value $content -Encoding UTF8 -NoNewline:$false

# Make executable (for Git for Windows / WSL)
if (Get-Command 'chmod' -ErrorAction SilentlyContinue) {
    chmod +x $hookFile
}

Write-Host "[install-hooks] pre-commit hook installed at: $hookFile" -ForegroundColor Green
Write-Host "[install-hooks] Staged .ts/.tsx files will be scanned on every commit." -ForegroundColor Green
