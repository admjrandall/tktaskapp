---
name: completion-report
description: Scaffold the mandatory completion report for any implementation, refactor, security, or compliance task in Task App CRM
---

Generate a completion report for the work just completed. Fill in each section accurately. Do not omit sections. If a check could not be run, state exactly why.

---

## Completion Report

### Summary

[One paragraph: what was done and why]

### Files changed

| File           | Why               |
| -------------- | ----------------- |
| `path/to/file` | Reason for change |

### Root cause

[What was wrong, incomplete, or missing — and why]

### Current-source verification

[For security, compliance, crypto, dependency version, or framework-sensitive work: identify sources checked, version/date, why they apply, and anything not verified against current sources. If verification was not performed, state "Not verified against current sources" and explain why.]

### Tests and checks run

```
pnpm run typecheck       → [PASS / FAIL / NOT RUN — reason]
pnpm run lint            → [PASS / FAIL / NOT RUN — reason]
pnpm run test            → [PASS / FAIL / NOT RUN — reason]
pnpm run build:offline   → [PASS / FAIL / NOT RUN — reason]
pnpm run build:enterprise → [PASS / FAIL / NOT RUN — reason]
cd server && pnpm typecheck → [PASS / FAIL / NOT RUN — reason]
cd server && pnpm test   → [PASS / FAIL / NOT RUN — reason]
```

[Add any other commands run with their output]

### Security and compliance impact

[What security controls were added, changed, or affected. What compliance controls map to this change. Use statuses: Implemented / Partially implemented / Designed / Not implemented / Not verified / Not applicable / Requires assessor/legal/security review]

### Remaining gaps

[List anything not closed: deferred work, items requiring external values, open questions, known risks. Be explicit — do not leave fixable items as "future work" without justification.]

### Safe to ship?

**[Yes / No / Partially, with restrictions]**

[Explanation. If "Partially": state exactly what the restriction is and who must approve before full shipment.]
