## Summary

<!-- 1–3 bullet points describing what this PR does and why -->

-

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Security fix / hardening
- [ ] Refactor (no behaviour change)
- [ ] Documentation
- [ ] Build / tooling
- [ ] Breaking change (describe below)

## Test plan

<!-- How did you test this? What should a reviewer verify? -->

- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run build:offline` produces a working `dist/offline/index.html`
- [ ] Manually tested in Chrome or Edge (describe scenario below)

**Manual test scenario:**

## Security checklist

<!-- Only required for changes to packages/core/src/ or security-sensitive areas -->

- [ ] No raw `innerHTML` assignments introduced (ESLint rule enforces this)
- [ ] All user-visible strings go through `escH()` before interpolation
- [ ] `trusted-types.ts` remains the first import in `main.ts`
- [ ] No new `trustedTypes.createPolicy()` calls with existing policy names
- [ ] `_dbKey` (CryptoKey) is never made extractable

## Breaking changes

<!-- Describe any breaking changes and migration path -->

## Changeset

- [ ] I ran `pnpm changeset` and included the generated file, OR
- [ ] This change does not require a version bump (chore, docs, ci, test)

## Related issues

<!-- Closes #X or References #X -->
