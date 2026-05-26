#!/usr/bin/env pwsh
# PostToolUse hook: scans edited .ts/.tsx files for stub/placeholder patterns.
# Reads Claude's tool-use JSON from stdin. Outputs warnings to stdout (Claude context).
# Exit 0 = allow (with warnings); Exit 2 = block (hard stop).

param()

$input_json = [Console]::In.ReadToEnd()

try {
    $tool_use = $input_json | ConvertFrom-Json -ErrorAction Stop
} catch {
    exit 0
}

$file_path = $tool_use.tool_input.file_path
if (-not $file_path) { exit 0 }

# Only scan TypeScript/TSX files
if ($file_path -notmatch '\.(ts|tsx)$') { exit 0 }
if (-not (Test-Path $file_path)) { exit 0 }

$BLOCKING_PATTERNS = @(
    @{ Pattern = 'throw new Error\([''"]Not implemented'; Label = 'NOT_IMPLEMENTED stub' },
    @{ Pattern = 'throw new Error\([''"]TODO';            Label = 'TODO throw stub' },
    @{ Pattern = '^\s*//\s*TODO:\s*implement';            Label = 'TODO: implement comment' },
    @{ Pattern = '^\s*return null;\s*//\s*(stub|placeholder|todo|fixme)'; Label = 'null-return stub' }
)

$WARNING_PATTERNS = @(
    @{ Pattern = '^\s*//\s*TODO';                  Label = 'TODO comment' },
    @{ Pattern = '^\s*//\s*FIXME';                 Label = 'FIXME comment' },
    @{ Pattern = '^\s*//\s*HACK';                  Label = 'HACK comment' },
    @{ Pattern = 'console\.log\(';                 Label = 'console.log in production path' },
    @{ Pattern = 'console\.debug\(';               Label = 'console.debug in production path' },
    @{ Pattern = '^\s*//\s*placeholder';            Label = 'placeholder comment' },
    @{ Pattern = '[''"]placeholder[''"]';            Label = 'placeholder string value' },
    @{ Pattern = '// stub';                        Label = 'stub comment' },
    @{ Pattern = 'as any\b';                       Label = 'type assertion to any (weakens type safety)' }
)

$lines = Get-Content $file_path
$blocking_hits = [System.Collections.Generic.List[string]]::new()
$warning_hits  = [System.Collections.Generic.List[string]]::new()

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineno = $i + 1

    foreach ($p in $BLOCKING_PATTERNS) {
        if ($line -match $p.Pattern) {
            $blocking_hits.Add("  Line $lineno [$($p.Label)]: $($line.Trim())")
        }
    }
    foreach ($p in $WARNING_PATTERNS) {
        if ($line -match $p.Pattern) {
            $warning_hits.Add("  Line $lineno [$($p.Label)]: $($line.Trim())")
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
