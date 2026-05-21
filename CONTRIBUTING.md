# Contributing to Task App CRM

Thank you for your interest in contributing to Task App CRM — an offline-first, AES-256-GCM encrypted CRM.

---

## Prerequisites

- **Node.js** — use the version pinned in [`.nvmrc`](.nvmrc). Install via [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm).
- **pnpm** — managed via [Corepack](https://nodejs.org/api/corepack.html) (included with Node.js 16+). The version is pinned in `package.json`.

---

## Setup

```bash
# Enable Corepack to manage pnpm
corepack enable

# Install dependencies
pnpm install

# Build the offline app
pnpm turbo run build:offline

# Open in browser — no server needed
open dist/offline/index.html   # macOS
start dist/offline/index.html  # Windows
xdg-open dist/offline/index.html  # Linux
```

---

## Development workflow

```bash
# Type-check all packages
pnpm run typecheck

# Lint
pnpm run lint

# Format
pnpm run format

# Build all targets
pnpm run build:all
```

---

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/).
Commit messages that don't match the convention are rejected by the `commit-msg` hook.

**Format:** `<type>(<scope>): <description>`

| Type       | When to use                               |
| ---------- | ----------------------------------------- |
| `feat`     | New user-visible feature                  |
| `fix`      | Bug fix                                   |
| `security` | Security fix or hardening                 |
| `perf`     | Performance improvement                   |
| `refactor` | Code restructure with no behaviour change |
| `test`     | Adding or updating tests                  |
| `docs`     | Documentation only                        |
| `build`    | Build system or tooling change            |
| `ci`       | CI/CD pipeline change                     |
| `chore`    | Dependency updates, housekeeping          |
| `revert`   | Reverts a previous commit                 |

**Examples:**

```
feat(ai): add Phi-4-mini support for Edge built-in AI
fix(crypto): handle corrupt vault blob during unlock
security(trusted-types): replace raw innerHTML with render helpers
docs(contributing): add pnpm setup instructions
```

**BREAKING CHANGES** — append `!` to the type and add a `BREAKING CHANGE:` footer:

```
feat!: rename apps/offline to apps/offline-web

BREAKING CHANGE: Build output path changed. Update any CI scripts that reference apps/offline.
```

---

## Pull request process

1. **Branch** — create a feature branch from `main` (`feat/short-description`).
2. **Changeset** — if your change is version-worthy, run `pnpm changeset` and follow the prompts. Include the generated `.changeset/*.md` file in your PR.
3. **Tests** — `pnpm run typecheck` and `pnpm run build:offline` must pass.
4. **Security rules** — never bypass the rules in `CLAUDE.md`:
   - `trusted-types.ts` must remain the first import in `main.ts`
   - All user-visible strings through `escH()` before `innerHTML` interpolation
   - Never make `_dbKey` extractable
5. **PR description** — use the pull request template. Include test steps and any security considerations.
6. **Review** — at least one approval is required before merge.

---

## Changeset instructions

Changesets track which packages changed and what type of version bump is needed.

```bash
# Add a changeset after making changes
pnpm changeset

# Select the packages affected, choose patch/minor/major, and write a summary
# This creates a file in .changeset/ — commit it with your changes

# To preview what the release would look like
pnpm changeset version --dry-run
```

Changesets are consumed automatically by the release workflow when merged to `main`.

---

## Architecture overview

See [`CLAUDE.md`](CLAUDE.md) for the full architecture guide, module dependency order, security rules, and build instructions.

Key rules:

- All app logic lives in `packages/core/src/`
- Apps (`apps/`) are thin entry points — no business logic
- The build output is `dist/offline/index.html` — a single self-contained HTML file
- Do not edit `taskapp.html` — it is the legacy reference file only
