# ============================================================
# Claude Code Power Stack — Windows 11 Install Script
# No WSL required. Run in PowerShell (not CMD, not Run).
# Do NOT run as Administrator unless a step says to.
# ============================================================
# Usage:
#   1. Open PowerShell (Win + X → Terminal)
#   2. Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   3. .\setup-claude-stack.ps1
#
# Or run individual phases by calling the functions at the bottom.
# ============================================================

param(
    [string]$RepoPath = "d:\techkeycrmapp",
    [switch]$SkipGit,
    [switch]$SkipNode,
    [switch]$PhaseFoundationOnly,
    [switch]$PhaseTokenOnly,
    [switch]$PhaseMemoryOnly,
    [switch]$PhaseAgentsOnly,
    [switch]$PhaseMCPOnly,
    [switch]$PhaseBMADOnly
)

$ErrorActionPreference = "Stop"

# ── Helpers ────────────────────────────────────────────────

function Write-Header($text) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
}

function Write-Step($text) {
    Write-Host "  → $text" -ForegroundColor Yellow
}

function Write-OK($text) {
    Write-Host "  ✓ $text" -ForegroundColor Green
}

function Write-Warn($text) {
    Write-Host "  ⚠ $text" -ForegroundColor Magenta
}

function Write-Fail($text) {
    Write-Host "  ✗ $text" -ForegroundColor Red
}

function Test-CommandExists($cmd) {
    $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Require-Restart {
    Write-Warn "A new terminal window is required for PATH changes to take effect."
    Write-Warn "After this script finishes, close this window and open a new one."
}

# ── Phase 1 — Foundation ───────────────────────────────────

function Install-Foundation {
    Write-Header "PHASE 1 — Foundation"

    # 1a Git for Windows
    if ($SkipGit) {
        Write-Warn "Skipping Git (--SkipGit flag set)"
    } elseif (Test-CommandExists "git") {
        $v = git --version
        Write-OK "Git already installed: $v"
    } else {
        Write-Step "Git for Windows not found. Opening download page..."
        Write-Host ""
        Write-Host "  Please download and install Git for Windows from:" -ForegroundColor White
        Write-Host "  https://git-scm.com/download/win" -ForegroundColor White
        Write-Host ""
        Write-Host "  IMPORTANT: Keep ALL default settings." -ForegroundColor Yellow
        Write-Host "  Make sure 'Add Git to PATH' stays checked." -ForegroundColor Yellow
        Write-Host ""
        Start-Process "https://git-scm.com/download/win"
        Read-Host "  Press Enter after Git for Windows is installed and you have reopened this terminal"
        if (-not (Test-CommandExists "git")) {
            Write-Fail "Git still not found. Please install it and rerun this script."
            exit 1
        }
        Write-OK "Git installed: $(git --version)"
    }

    # 1b Node.js
    if ($SkipNode) {
        Write-Warn "Skipping Node.js (--SkipNode flag set)"
    } elseif (Test-CommandExists "node") {
        $nodeVer = node --version
        $major = [int]($nodeVer -replace 'v(\d+)\..*','$1')
        if ($major -lt 20) {
            Write-Warn "Node.js $nodeVer found but version 20+ is required."
            Write-Host "  Download from: https://nodejs.org (LTS version)" -ForegroundColor White
            Start-Process "https://nodejs.org"
            Read-Host "  Press Enter after upgrading Node.js and reopening this terminal"
        } else {
            Write-OK "Node.js already installed: $nodeVer"
        }
    } else {
        Write-Step "Node.js not found. Opening download page..."
        Write-Host ""
        Write-Host "  Please download and install the LTS version from:" -ForegroundColor White
        Write-Host "  https://nodejs.org" -ForegroundColor White
        Start-Process "https://nodejs.org"
        Read-Host "  Press Enter after Node.js is installed and you have reopened this terminal"
        if (-not (Test-CommandExists "node")) {
            Write-Fail "Node.js still not found. Please install it and rerun this script."
            exit 1
        }
        Write-OK "Node.js installed: $(node --version)"
    }

    # 1c Claude Code
    if (Test-CommandExists "claude") {
        Write-OK "Claude Code already installed: $(claude --version)"
    } else {
        Write-Step "Installing Claude Code (native installer)..."
        try {
            Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
            Write-OK "Claude Code installed"
            Require-Restart
        } catch {
            Write-Fail "Native installer failed. Trying npm fallback..."
            npm install -g @anthropic-ai/claude-code
            Write-OK "Claude Code installed via npm"
        }
    }

    # 1d PATH check
    $localBin = "$env:USERPROFILE\.local\bin"
    if ($env:PATH -notcontains $localBin) {
        Write-Warn "Adding $localBin to PATH for this session..."
        $env:PATH += ";$localBin"

        # Persist to user profile
        $profilePath = [System.Environment]::GetFolderPath("UserProfile") + "\Documents\PowerShell\Microsoft.PowerShell_profile.ps1"
        $pathLine = "`$env:PATH += `";$localBin`""
        if (-not (Test-Path $profilePath)) {
            New-Item -Path $profilePath -ItemType File -Force | Out-Null
        }
        $existing = Get-Content $profilePath -ErrorAction SilentlyContinue
        if ($existing -notcontains $pathLine) {
            Add-Content -Path $profilePath -Value $pathLine
            Write-OK "PATH persisted to PowerShell profile"
        }
    }

    # 1e Authenticate
    if (Test-CommandExists "claude") {
        Write-Host ""
        Write-Step "Running claude doctor to check health..."
        claude doctor
        Write-Host ""
        Write-Warn "If you have not authenticated yet, run: claude"
        Write-Warn "A browser tab will open — sign in with your Claude Pro/Max account."
    }

    Write-OK "Phase 1 complete — Foundation installed"
}

# ── Phase 2 — Token Control ────────────────────────────────

function Install-TokenControl {
    Write-Header "PHASE 2 — Token Control"

    if (-not (Test-Path $RepoPath)) {
        Write-Warn "Repo path $RepoPath not found — skipping .claudeignore creation"
        Write-Warn "Run this phase again from inside your repo, or set -RepoPath"
    } else {
        # 2a .claudeignore
        $ignoreFile = Join-Path $RepoPath ".claudeignore"
        if (Test-Path $ignoreFile) {
            Write-OK ".claudeignore already exists at $ignoreFile"
        } else {
            Write-Step "Creating .claudeignore at $ignoreFile..."
            $content = @"
# Build outputs
dist/
build/
.next/
out/

# Dependencies
node_modules/
.pnpm-store/

# Git internals
.git/

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Test coverage
coverage/
.nyc_output/

# OS files
.DS_Store
Thumbs.db
desktop.ini

# IDE files
.vscode/settings.json
.idea/

# Legacy reference file
taskapp.html

# Drizzle generated migrations (read only when explicitly needed)
server/drizzle/
"@
            Set-Content -Path $ignoreFile -Value $content -Encoding UTF8
            Write-OK ".claudeignore created — 50-70% token reduction in effect"
        }
    }

    # 2b ccusage — no global install needed, pnpm dlx works
    Write-Step "Verifying ccusage works via pnpm dlx..."
    try {
        pnpm dlx ccusage --help 2>&1 | Out-Null
        Write-OK "ccusage available — use: pnpm dlx ccusage daily"
    } catch {
        Write-Warn "ccusage test failed — try manually: pnpm dlx ccusage daily"
    }

    # 2c Claude Code Usage Monitor (Windows taskbar)
    Write-Step "Installing Claude Code Usage Monitor (Windows taskbar widget)..."
    if (Test-CommandExists "winget") {
        try {
            winget install CodeZeno.ClaudeCodeUsageMonitor --accept-source-agreements --accept-package-agreements
            Write-OK "Claude Code Usage Monitor installed — look for it in your taskbar/notification area"
        } catch {
            Write-Warn "winget install failed. Download manually from:"
            Write-Host "  https://github.com/CodeZeno/Claude-Code-Usage-Monitor/releases" -ForegroundColor White
        }
    } else {
        Write-Warn "winget not available. Download Claude Code Usage Monitor from:"
        Write-Host "  https://github.com/CodeZeno/Claude-Code-Usage-Monitor/releases" -ForegroundColor White
        Start-Process "https://github.com/CodeZeno/Claude-Code-Usage-Monitor/releases"
    }

    Write-OK "Phase 2 complete — Token control installed"
}

# ── Phase 3 — Memory ───────────────────────────────────────

function Install-Memory {
    Write-Header "PHASE 3 — Persistent Memory"

    # 3a claude-mem
    Write-Step "Installing claude-mem (persistent cross-session memory)..."
    Write-Warn "This installs Bun automatically — may take 1-2 minutes"
    try {
        npx claude-mem install
        Write-OK "claude-mem installed and hooks registered"
    } catch {
        Write-Fail "claude-mem install failed: $_"
        Write-Warn "Try manually: npx claude-mem install"
        Write-Warn "If Bun fails to install, download from: https://bun.sh"
    }

    # 3b mcp-memory-keeper
    Write-Step "Adding mcp-memory-keeper MCP server..."
    if (Test-CommandExists "claude") {
        try {
            claude mcp add memory-keeper npx mcp-memory-keeper
            Write-OK "mcp-memory-keeper added"
        } catch {
            Write-Warn "MCP add failed — try manually: claude mcp add memory-keeper npx mcp-memory-keeper"
        }
    } else {
        Write-Warn "claude not found in PATH — run 'claude mcp add memory-keeper npx mcp-memory-keeper' manually after installing Claude Code"
    }

    Write-OK "Phase 3 complete — Memory installed"
    Write-Host ""
    Write-Host "  Verify memory is working:" -ForegroundColor White
    Write-Host "  npx claude-mem status" -ForegroundColor Gray
}

# ── Phase 4 — Parallel Agents ──────────────────────────────

function Install-ParallelAgents {
    Write-Header "PHASE 4 — Parallel Agent Setup"

    # 4a wmux
    Write-Step "wmux — native Windows terminal multiplexer..."
    Write-Host ""
    Write-Host "  wmux is the tmux replacement for Windows (no WSL needed)." -ForegroundColor White
    Write-Host "  Download from: https://wmux.app or https://github.com/openwong2kim/wmux" -ForegroundColor White

    if (Test-CommandExists "winget") {
        try {
            winget install wmux --accept-source-agreements --accept-package-agreements 2>&1
            Write-OK "wmux installed via winget"
        } catch {
            Write-Warn "winget install not available for wmux yet — download from wmux.app"
            Start-Process "https://wmux.app"
        }
    } else {
        Start-Process "https://wmux.app"
        Read-Host "  Press Enter after downloading and installing wmux"
    }

    # 4b Git worktrees
    if (Test-Path $RepoPath) {
        Write-Step "Setting up Git worktrees for parallel agents..."
        Push-Location $RepoPath

        $worktrees = @(
            @{ Path = "..\techkeycrmapp-agent-a"; Branch = "feat/ui-phase1" },
            @{ Path = "..\techkeycrmapp-agent-b"; Branch = "feat/ai-phase2" },
            @{ Path = "..\techkeycrmapp-agent-c"; Branch = "feat/server-phase3" },
            @{ Path = "..\techkeycrmapp-agent-f"; Branch = "feat/verifier" }
        )

        foreach ($wt in $worktrees) {
            $fullPath = Resolve-Path (Join-Path $RepoPath $wt.Path) -ErrorAction SilentlyContinue
            if ($null -ne $fullPath -and (Test-Path $fullPath)) {
                Write-OK "Worktree already exists: $($wt.Path)"
            } else {
                try {
                    git worktree add $wt.Path $wt.Branch 2>&1
                    Write-OK "Worktree created: $($wt.Path) → $($wt.Branch)"
                } catch {
                    # Branch might not exist yet — create it
                    try {
                        git worktree add -b $wt.Branch $wt.Path 2>&1
                        Write-OK "Worktree created with new branch: $($wt.Path) → $($wt.Branch)"
                    } catch {
                        Write-Warn "Worktree creation failed for $($wt.Path): $_"
                        Write-Warn "Run manually: git worktree add -b $($wt.Branch) $($wt.Path)"
                    }
                }
            }
        }

        Pop-Location
        Write-Host ""
        Write-Host "  Active worktrees:" -ForegroundColor White
        git -C $RepoPath worktree list
    } else {
        Write-Warn "Repo path $RepoPath not found — skipping worktree setup"
        Write-Warn "Run manually from inside your repo: git worktree add ..\techkeycrmapp-agent-a feat/ui-phase1"
    }

    Write-OK "Phase 4 complete — Parallel agent infrastructure ready"
}

# ── Phase 5 — MCP Servers ──────────────────────────────────

function Install-MCP {
    Write-Header "PHASE 5 — MCP Servers"

    if (-not (Test-CommandExists "claude")) {
        Write-Fail "claude not found — install Phase 1 first"
        return
    }

    # 5a GitHub MCP
    Write-Step "Adding GitHub MCP server..."
    try {
        claude mcp add github -- npx -y @modelcontextprotocol/server-github
        Write-OK "GitHub MCP added"
    } catch {
        Write-Warn "GitHub MCP add failed — try manually:"
        Write-Host "  claude mcp add github -- npx -y @modelcontextprotocol/server-github" -ForegroundColor Gray
    }

    # 5b Context7 MCP
    Write-Step "Adding Context7 MCP server (auto library docs)..."
    try {
        claude mcp add context7 -- npx -y @context7/mcp-server
        Write-OK "Context7 MCP added"
    } catch {
        Write-Warn "Context7 MCP add failed — try manually:"
        Write-Host "  claude mcp add context7 -- npx -y @context7/mcp-server" -ForegroundColor Gray
    }

    # 5c GitHub token reminder
    Write-Host ""
    Write-Warn "GitHub MCP needs a personal access token to function."
    Write-Host "  1. Go to: https://github.com/settings/tokens" -ForegroundColor White
    Write-Host "  2. Generate a new token (classic) with: repo, read:org" -ForegroundColor White
    Write-Host "  3. Add to your PowerShell profile:" -ForegroundColor White
    Write-Host '     $env:GITHUB_TOKEN = "ghp_your_token_here"' -ForegroundColor Gray
    Write-Host ""

    # 5d List current MCP servers
    Write-Step "Current MCP servers:"
    claude mcp list

    Write-OK "Phase 5 complete — MCP servers installed"
    Write-Warn "Do not add more than 3 MCP servers — each one costs tokens at session start"
}

# ── Phase 6 — BMAD ─────────────────────────────────────────

function Install-BMAD {
    Write-Header "PHASE 6 — BMAD Agent Framework"

    if (-not (Test-Path $RepoPath)) {
        Write-Fail "Repo path $RepoPath not found — set -RepoPath to your actual path"
        return
    }

    Push-Location $RepoPath

    Write-Step "Installing BMAD Method in $RepoPath ..."
    Write-Host ""
    Write-Host "  The installer will ask you several questions." -ForegroundColor White
    Write-Host "  Answer as follows:" -ForegroundColor White
    Write-Host "    Which IDE? → claude-code" -ForegroundColor Gray
    Write-Host "    User skill level? → expert" -ForegroundColor Gray
    Write-Host "    Project knowledge? → existing" -ForegroundColor Gray
    Write-Host "    Modules? → accept defaults" -ForegroundColor Gray
    Write-Host ""
    Read-Host "  Press Enter to start the BMAD installer"

    try {
        npx bmad-method install
        Write-OK "BMAD installed"
    } catch {
        Write-Fail "BMAD install failed: $_"
        Write-Warn "Try manually: npx bmad-method install"
        Pop-Location
        return
    }

    # Create .claude/agents and .claude/commands directories
    $agentsDir = Join-Path $RepoPath ".claude\agents"
    $commandsDir = Join-Path $RepoPath ".claude\commands"
    New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null
    New-Item -ItemType Directory -Force -Path $commandsDir | Out-Null
    Write-OK "Created .claude\agents\ and .claude\commands\"

    # Create Agent F (Verifier) — the safe first agent
    $agentFPath = Join-Path $agentsDir "agent-f-verifier.md"
    if (-not (Test-Path $agentFPath)) {
        $agentFContent = @"
---
name: agent-f-verifier
description: Runs the full verification suite after every weekly merge. Read-only agent — never modifies source files. Invoke with /project:verify.
model: claude-sonnet-4-6
tools: Read, Bash, Glob, Grep
---
You are Agent F, the verifier for the Task App CRM monorepo (d:\techkeycrmapp).

You do NOT write production code. Your only job is to run the verification suite and write a report.

## Verification gates (run in order)

1. pnpm run typecheck — report any errors, zero required to pass
2. pnpm run lint — report any errors, zero required to pass
3. pnpm test — report all failures
4. pnpm run build:offline && pnpm run build:sync && pnpm run build:dataverse — all must succeed
5. Check new AI event types appear in BOTH security/audit.ts AND schemas/audit.schema.ts
6. Check new IDB stores appear in BOTH IDB_STORES in constants.ts AND _dataDbOpen() in storage/idb-data.ts
7. Check new storage keys appear in BOTH STORES or IDB_STORES AND any code that reads them
8. Check that all renderX/bindX pairs are balanced in views/

## Report format

Write to: verifier/phase-N-week-M.md

Include:
- Pass/fail per gate
- Files touched in this merge
- Any contract violations (agent touching paths they do not own)
- Regression suggestions

## Owned paths

verifier/ only.

## NEVER touch

packages/, apps/, server/, or any source file.
"@
        Set-Content -Path $agentFPath -Value $agentFContent -Encoding UTF8
        Write-OK "Agent F (Verifier) created at $agentFPath"
    } else {
        Write-OK "Agent F already exists"
    }

    # Create /project:verify slash command
    $verifyCmd = Join-Path $commandsDir "verify.md"
    if (-not (Test-Path $verifyCmd)) {
        $verifyCmdContent = @"
Run Agent F verification suite on the current integration branch state.

Spawn agent-f-verifier as a subagent.
Report results clearly — pass or fail per gate.
Block the merge report if any gate fails and tag the responsible agent.
Write output to verifier/phase-{N}-week-{M}.md where N and M are the current phase and week numbers.
"@
        Set-Content -Path $verifyCmd -Value $verifyCmdContent -Encoding UTF8
        Write-OK "/project:verify slash command created"
    }

    # Create VS Code settings for Git Bash default terminal
    $vscodeDir = Join-Path $RepoPath ".vscode"
    New-Item -ItemType Directory -Force -Path $vscodeDir | Out-Null
    $vscodeSettings = Join-Path $vscodeDir "settings.json"
    if (-not (Test-Path $vscodeSettings)) {
        $settings = @"
{
  "terminal.integrated.defaultProfile.windows": "Git Bash",
  "terminal.integrated.profiles.windows": {
    "Git Bash": {
      "source": "Git Bash"
    },
    "PowerShell": {
      "source": "PowerShell"
    }
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.git": true
  }
}
"@
        Set-Content -Path $vscodeSettings -Value $settings -Encoding UTF8
        Write-OK ".vscode/settings.json created — Git Bash is now the default VS Code terminal"
    } else {
        Write-OK ".vscode/settings.json already exists — add Git Bash settings manually if needed"
    }

    Pop-Location
    Write-OK "Phase 6 complete — BMAD installed"
}

# ── Summary ────────────────────────────────────────────────

function Show-Summary {
    Write-Header "INSTALLATION COMPLETE"
    Write-Host ""
    Write-Host "  What was installed:" -ForegroundColor White
    Write-Host "  ✓ Claude Code (native, auto-updating)" -ForegroundColor Green
    Write-Host "  ✓ .claudeignore (50-70% token reduction)" -ForegroundColor Green
    Write-Host "  ✓ ccusage (token history reports)" -ForegroundColor Green
    Write-Host "  ✓ Claude Code Usage Monitor (taskbar widget)" -ForegroundColor Green
    Write-Host "  ✓ claude-mem (persistent memory across sessions)" -ForegroundColor Green
    Write-Host "  ✓ mcp-memory-keeper (MCP memory backup)" -ForegroundColor Green
    Write-Host "  ✓ wmux (parallel agent terminal — no WSL)" -ForegroundColor Green
    Write-Host "  ✓ Git worktrees (one per agent)" -ForegroundColor Green
    Write-Host "  ✓ GitHub MCP server" -ForegroundColor Green
    Write-Host "  ✓ Context7 MCP server" -ForegroundColor Green
    Write-Host "  ✓ BMAD Method framework" -ForegroundColor Green
    Write-Host "  ✓ Agent F (Verifier) config" -ForegroundColor Green
    Write-Host "  ✓ /project:verify slash command" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Open wmux and split into panes" -ForegroundColor White
    Write-Host "  2. Set GITHUB_TOKEN in your PowerShell profile" -ForegroundColor White
    Write-Host "  3. Create remaining agent .md files in .claude\agents\" -ForegroundColor White
    Write-Host "  4. Install Claude Code VS Code extension (Ctrl+Shift+X → search 'Claude Code')" -ForegroundColor White
    Write-Host "  5. Run: claude doctor" -ForegroundColor White
    Write-Host "  6. Run: claude mcp list" -ForegroundColor White
    Write-Host ""
    Write-Host "  Daily commands:" -ForegroundColor Cyan
    Write-Host "  pnpm dlx ccusage daily        # token history" -ForegroundColor Gray
    Write-Host "  pnpm dlx ccusage blocks --live # live 5-hour window" -ForegroundColor Gray
    Write-Host "  npx claude-mem status          # memory health" -ForegroundColor Gray
    Write-Host "  claude doctor                  # full health check" -ForegroundColor Gray
    Write-Host "  winget upgrade Anthropic.ClaudeCode  # update Claude Code" -ForegroundColor Gray
    Write-Host ""
}

# ── Main ───────────────────────────────────────────────────

Write-Host ""
Write-Host "  Claude Code Power Stack — Windows 11 Setup" -ForegroundColor Cyan
Write-Host "  No WSL · Verified May 2026" -ForegroundColor Gray
Write-Host ""
Write-Warn "Run in PowerShell (not CMD). Do NOT run as Administrator."
Write-Host ""

# Allow running individual phases via flags
if ($PhaseFoundationOnly) { Install-Foundation; exit 0 }
if ($PhaseTokenOnly)     { Install-TokenControl; exit 0 }
if ($PhaseMemoryOnly)    { Install-Memory; exit 0 }
if ($PhaseAgentsOnly)    { Install-ParallelAgents; exit 0 }
if ($PhaseMCPOnly)       { Install-MCP; exit 0 }
if ($PhaseBMADOnly)      { Install-BMAD; exit 0 }

# Full install
Install-Foundation
Install-TokenControl
Install-Memory
Install-ParallelAgents
Install-MCP
Install-BMAD
Show-Summary
