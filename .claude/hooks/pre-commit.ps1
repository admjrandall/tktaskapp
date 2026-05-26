#Requires -Version 7
# .claude/hooks/pre-commit.ps1
# Git pre-commit hook - scans staged .ts/.tsx files for blocking stubs.
# Exit 0 = allow commit (warnings printed but non-blocking)
# Exit 1 = block commit (hard stubs found)
#
# Install: run .claude/scripts/install-hooks.ps1 once per checkout.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- locate repo root relative to this script ---------------------------------
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$patternsFile = Join-Path $PSScriptRoot 'stub-patterns.json'

if (-not (Test-Path $patternsFile)) {
    Write-Host "[pre-commit] stub-patterns.json not found at $patternsFile - skipping scan" -ForegroundColor Yellow
    exit 0
}

$patterns = Get-Content $patternsFile -Raw | ConvertFrom-Json

# --- get staged .ts/.tsx files -----------------------------------------------
$staged = git -C $repoRoot diff --cached --name-only --diff-filter=ACM |
    Where-Object { $_ -match '\.(ts|tsx)$' }

if (-not $staged) {
    exit 0
}

# --- scan each staged file ----------------------------------------------------
$blockingFindings = [System.Collections.Generic.List[string]]::new()
$warningFindings  = [System.Collections.Generic.List[string]]::new()

foreach ($relativePath in $staged) {
    $fullPath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path $fullPath)) { continue }

    $lines = Get-Content $fullPath -Encoding UTF8
    $lineNum = 0

    foreach ($line in $lines) {
        $lineNum++

        foreach ($entry in $patterns.blocking) {
            if ($line -match $entry.pattern) {
                $blockingFindings.Add("  BLOCK [$($entry.label)] $relativePath`:$lineNum")
                $blockingFindings.Add("        $($line.Trim())")
            }
        }

        foreach ($entry in $patterns.warning) {
            if ($line -match $entry.pattern) {
                $warningFindings.Add("  WARN  [$($entry.label)] $relativePath`:$lineNum")
            }
        }
    }
}

# --- report -------------------------------------------------------------------
$hasBlock = $blockingFindings.Count -gt 0
$hasWarn  = $warningFindings.Count -gt 0

if (-not $hasBlock -and -not $hasWarn) {
    exit 0
}

Write-Host ""
Write-Host "  Stub scan -- $($staged.Count) staged file(s)" -ForegroundColor Cyan

if ($hasWarn) {
    Write-Host ""
    Write-Host "  Warnings (commit allowed):" -ForegroundColor Yellow
    foreach ($line in $warningFindings) {
        Write-Host $line -ForegroundColor Yellow
    }
}

if ($hasBlock) {
    Write-Host ""
    Write-Host "  Blocking stubs found -- commit rejected:" -ForegroundColor Red
    foreach ($line in $blockingFindings) {
        Write-Host $line -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "  Resolve the stubs above, then re-run: git commit" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# Warnings only - allow commit
Write-Host ""
Write-Host "  $($warningFindings.Count) warning(s) - commit proceeding. Run gap-auditor before PR." -ForegroundColor Yellow
Write-Host ""
exit 0
