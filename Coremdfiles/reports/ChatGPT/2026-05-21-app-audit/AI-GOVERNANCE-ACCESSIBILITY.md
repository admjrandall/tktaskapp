# AI Governance and Accessibility Report

Assessment date: 2026-05-21

## Benchmarks

- ISO/IEC 42001:2023 AI management system expectations
- NIST AI RMF 1.0, including 2026 NIST AI RMF profile activity
- EU AI Act, Regulation (EU) 2024/1689
- OWASP LLM Top 10 and LLMSVS 2.0
- WCAG 2.2 / ISO/IEC 40500:2025

## AI Governance Summary

The AI implementation is stronger than typical for this maturity stage. Mutating tools are gated by human approval, CRM data is explicitly treated as adversarial context, and the governance policy already maps many ISO 42001 gaps.

The main issue is not intent; it is evidence. Most AI management-system controls still lack formal sign-off, recurring review, operational metrics, model evaluations, and incident procedures.

## AI Strengths

| Control                          | Evidence                                                                                          | Assessment                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Human approval for write actions | `ai-tools.ts` uses `pendingAction` before mutating tools execute                                  | Strong design control.                                            |
| Tool schema validation           | `validateToolArgs()` and `sanitizeToolFields()`                                                   | Good protection against malformed tool calls and mass assignment. |
| Prompt injection awareness       | CRM context wrapped in `<crm_data>` and system prompt warns against following record instructions | Appropriate defense-in-depth.                                     |
| Offline AI egress control        | Browser-AI build aliases cloud providers to disabled stubs                                        | Good for default offline artifact.                                |
| Governance policy                | `docs/compliance/ai-governance-policy.md`                                                         | Solid start.                                                      |
| ISO 42001 self-assessment        | `docs/compliance/iso42001-evidence-map.md`                                                        | Honest maturity mapping.                                          |

## AI Gaps

| Gap                                                                              | Severity | Recommendation                                                                                            |
| -------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| Prompt-injection tests are mostly static, not model/harness tests                | High     | Add active tests that simulate malicious CRM records and verify no write executes without approval.       |
| No model cards                                                                   | Medium   | Add model card for each browser/local/cloud model.                                                        |
| No AI incident response procedure                                                | High     | Define triage, containment, customer notice, evidence retention, and corrective action.                   |
| No AI risk register with likelihood/impact/residual risk                         | High     | Create a formal ISO 42001/NIST AI RMF risk register.                                                      |
| No user-facing AI transparency notice                                            | Medium   | Add visible disclosure of model location, data boundary, limitations, and human approval.                 |
| No model quality metrics                                                         | Medium   | Track acceptance/rejection rate, failed tool calls, hallucination reports, and prompt-injection attempts. |
| Cloud model inventory is listed but cloud profiles are not production-controlled | High     | Require DPA, tenant consent, PII policy, and data residency decision before enabling.                     |

## EU AI Act Note

Based on current inspected behavior, the default offline CRM assistant appears more likely to be a limited/minimal-risk productivity assistant than a high-risk AI system. That classification is an inference and must be re-evaluated if the product is used for HR, worker management, credit, education, healthcare, law enforcement, critical infrastructure, or legally significant automated decisions.

Required next step:

- Add an AI Act classification memo per feature and deployment profile.
- Document whether the organization is provider, deployer, importer, or distributor for each AI component.
- Track August 2, 2026 EU AI Act high-risk obligations where applicable.

## Accessibility Summary

Accessibility has good test intent but insufficient verified coverage for WCAG 2.2 AA.

Evidence:

- Vitest suite includes many accessibility unit tests and many `it.todo` tests.
- Playwright E2E tests exist for focus traps, keyboard navigation, and screen-reader labels.
- CI accessibility scan covers the pre-auth page, not the full authenticated app.
- CI disables `color-contrast` and `scrollable-region-focusable`.
- Local test result: 100 todo tests across the overall suite.

## WCAG 2.2 AA Readiness

| Area                 | Current posture                                 | Gap                                                                          |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Keyboard access      | Static tests verify buttons/landmarks in places | Full post-auth keyboard traversal must run in Playwright.                    |
| Focus management     | E2E specs document expected behavior            | Known focus-trap gaps are documented; need active passing runs.              |
| Dialog semantics     | Tests exist                                     | Must verify every modal uses role, aria-modal, labelledby, and focus return. |
| Color contrast       | Disabled in CI axe scan                         | Must run and pass contrast checks against design tokens.                     |
| Screen reader labels | Tests exist                                     | Need active Playwright/axe evidence for authenticated screens.               |
| Mobile accessibility | Not proven                                      | Needs viewport, touch target, orientation, and screen reader checks.         |

## Accessibility Remediation Plan

1. Build offline artifact in CI.
2. Run Playwright accessibility specs against authenticated seeded vault state.
3. Re-enable color contrast or create a manual contrast report with token evidence.
4. Fix modal focus traps and focus return.
5. Add `aria-live`, table captions/labels, and progressbar semantics where tests expect them.
6. Update WCAG target from 2.1 AA language to WCAG 2.2 AA / ISO/IEC 40500:2025.
7. Produce an accessibility conformance report before commercial release.
