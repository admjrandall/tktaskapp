#!/usr/bin/env pwsh
# PostToolUse hook: scans a single edited .ts/.tsx file for stub/placeholder patterns.
# Reads Claude's tool-use JSON from stdin. Patterns loaded from stub-patterns.json.
# Exit 0 = allow (stdout becomes Claude context); Exit 2 = block.

param()

$input_json = [Console]::In.ReadToEnd()

try {
    $tool_use = $input_json | ConvertFrom-Json -ErrorAction Stop
} catch {
    exit 0
}

$file_path = $tool_use.tool_input.file_path
if (-not $file_path) { exit 0 }
if ($file_path -notmatch '\.(ts|tsx)$') { exit 0 }
if (-not (Test-Path $file_path)) { exit 0 }

$patterns_file = Join-Path $PSScriptRoot 'stub-patterns.json'
$patterns = Get-Content $patterns_file -Raw | ConvertFrom-Json

$lines = Get-Content $file_path
$blocking_hits = [System.Collections.Generic.List[string]]::new()
$warning_hits  = [System.Collections.Generic.List[string]]::new()

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line   = $lines[$i]
    $lineno = $i + 1

    foreach ($p in $patterns.blocking) {
        if ($line -match $p.pattern) {
            $blocking_hits.Add("  Line $lineno [$($p.label)]: $($line.Trim())")
        }
    }
    foreach ($p in $patterns.warning) {
        if ($line -match $p.pattern) {
            $warning_hits.Add("  Line $lineno [$($p.label)]: $($line.Trim())")
        }
    }
}

$rel = $file_path -replace [regex]::Escape((Get-Location).Path + '\'), ''

if ($blocking_hits.Count -gt 0) {
    Write-Output ""
    Write-Output "STUB SCANNER — BLOCKING: $rel contains unfinished stubs that must be resolved before continuing:"
    $blocking_hits | ForEach-Object { Write-Output $_ }
    Write-Output ""
    Write-Output "Resolve these stubs or explicitly justify leaving them. Do not commit placeholder implementations."
    exit 2
}

if ($warning_hits.Count -gt 0) {
    Write-Output ""
    Write-Output "STUB SCANNER — WARNING: $rel contains patterns that may indicate incomplete work:"
    $warning_hits | ForEach-Object { Write-Output $_ }
    Write-Output ""
    Write-Output "Review each item. Remove debug output and resolve TODOs before marking work complete."
}

exit 0
