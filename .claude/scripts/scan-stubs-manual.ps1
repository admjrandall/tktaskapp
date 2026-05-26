#!/usr/bin/env pwsh
# Manual stub/placeholder scanner for Task App CRM.
# Scans one file, one directory, or the default source dirs (packages/core/src, server/src, apps).
# Patterns loaded from .claude/hooks/stub-patterns.json.
#
# Usage:
#   .\.claude\scripts\scan-stubs-manual.ps1                        # scan full repo source
#   .\.claude\scripts\scan-stubs-manual.ps1 -Path server/src       # scan one directory
#   .\.claude\scripts\scan-stubs-manual.ps1 -Path src/storage/db.ts  # scan one file
#   .\.claude\scripts\scan-stubs-manual.ps1 -BlockingOnly          # show only hard stubs
#   .\.claude\scripts\scan-stubs-manual.ps1 -Summary               # counts only, no line detail

param(
    [string]$Path = '',
    [switch]$BlockingOnly,
    [switch]$Summary
)

$repo_root    = Resolve-Path (Join-Path $PSScriptRoot '../..')
$patterns_file = Join-Path $PSScriptRoot '../hooks/stub-patterns.json'
$patterns      = Get-Content $patterns_file -Raw | ConvertFrom-Json

$default_dirs = @(
    Join-Path $repo_root 'packages\core\src'
    Join-Path $repo_root 'server\src'
    Join-Path $repo_root 'apps'
)

# Resolve the list of .ts/.tsx files to scan
if ($Path -ne '') {
    $resolved = Join-Path $repo_root $Path
    if (-not (Test-Path $resolved)) {
        Write-Error "Path not found: $resolved"
        exit 1
    }
    if (Test-Path $resolved -PathType Leaf) {
        $files = @(Get-Item $resolved)
    } else {
        $files = Get-ChildItem $resolved -Recurse -Include '*.ts','*.tsx'
    }
} else {
    $files = $default_dirs | Where-Object { Test-Path $_ } |
             ForEach-Object { Get-ChildItem $_ -Recurse -Include '*.ts','*.tsx' }
}

$total_blocking = 0
$total_warning  = 0
$file_count     = 0
$findings       = [System.Collections.Generic.List[string]]::new()

foreach ($file in $files) {
    $rel   = $file.FullName -replace [regex]::Escape($repo_root.Path + '\'), ''
    $lines = Get-Content $file.FullName
    $file_blocking = [System.Collections.Generic.List[string]]::new()
    $file_warning  = [System.Collections.Generic.List[string]]::new()

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line   = $lines[$i]
        $lineno = $i + 1

        foreach ($p in $patterns.blocking) {
            if ($line -match $p.pattern) {
                $file_blocking.Add("  $($rel):$lineno [BLOCKING — $($p.label)]: $($line.Trim())")
            }
        }
        if (-not $BlockingOnly) {
            foreach ($p in $patterns.warning) {
                if ($line -match $p.pattern) {
                    $file_warning.Add("  $($rel):$lineno [WARNING — $($p.label)]: $($line.Trim())")
                }
            }
        }
    }

    if ($file_blocking.Count -gt 0 -or $file_warning.Count -gt 0) {
        $file_count++
        $total_blocking += $file_blocking.Count
        $total_warning  += $file_warning.Count

        if (-not $Summary) {
            $file_blocking | ForEach-Object { $findings.Add($_) }
            $file_warning  | ForEach-Object { $findings.Add($_) }
        }
    }
}

# Output
if ($findings.Count -gt 0) {
    Write-Host ""
    Write-Host "STUB SCAN RESULTS" -ForegroundColor Cyan
    Write-Host "=================================================="

    $findings | ForEach-Object {
        if ($_ -match '\[BLOCKING') {
            Write-Host $_ -ForegroundColor Red
        } else {
            Write-Host $_ -ForegroundColor Yellow
        }
    }
    Write-Host ""
}

Write-Host "=================================================="
Write-Host "Summary: $file_count file(s) with findings"
Write-Host "  Blocking : $total_blocking" -ForegroundColor $(if ($total_blocking -gt 0) { 'Red' } else { 'Green' })
Write-Host "  Warnings : $total_warning"  -ForegroundColor $(if ($total_warning  -gt 0) { 'Yellow' } else { 'Green' })
Write-Host "=================================================="

if ($total_blocking -gt 0) {
    exit 2
} elseif ($total_warning -gt 0) {
    exit 1
} else {
    Write-Host "No issues found." -ForegroundColor Green
    exit 0
}
