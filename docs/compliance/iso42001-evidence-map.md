# ISO/IEC 42001:2023 Gap Assessment — Task App CRM

**Standard:** ISO/IEC 42001:2023 — Information technology — Artificial intelligence — Management system  
**Assessment date:** 2026-05-20  
**Assessor:** Task App CRM team (self-assessment)  
**Scope:** All AI features across all build profiles of Task App CRM  
**Related:** `docs/compliance/ai-governance-policy.md`

---

## How to read this table

| Column            | Meaning                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| **Control**       | ISO 42001 clause number and title                                      |
| **Requirement**   | What the standard requires                                             |
| **Current state** | What Task App CRM has today                                            |
| **Gap**           | What is missing or incomplete                                          |
| **Owner**         | Role or team responsible for closing the gap                           |
| **Target phase**  | Which implementation phase will address the gap (from `filerevamp.md`) |

Status codes: ✅ Conformant · ⚠️ Partial · ❌ Not addressed · 🔵 N/A (out of scope for current profile)

---

## Clause 4 — Context of the organisation

| Control                                                          | Requirement                                                                 | Current state                                                                               | Gap                                                                                                 | Status | Owner    | Target phase |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ | -------- | ------------ |
| 4.1 — Understanding the organisation and its context             | Determine internal and external issues relevant to the AI management system | Offline CRM context documented in CLAUDE.md; no formal external context analysis            | No structured internal/external issues register; no interested party analysis                       | ⚠️     | CRM team | Enterprise   |
| 4.2 — Understanding needs and expectations of interested parties | Identify parties with interest in the AI system and their requirements      | End-user data boundary rules documented in governance policy                                | No formal interested party register; no documented regulatory requirements list per jurisdiction    | ❌     | CRM team | Enterprise   |
| 4.3 — Determining the scope of the AI management system          | Document the boundary and applicability of the AIMS                         | Scope defined: all AI features in all build profiles, as documented in governance policy §1 | No formal scope statement signed by top management                                                  | ⚠️     | CRM team | Enterprise   |
| 4.4 — AI management system                                       | Establish, implement, maintain, and improve an AIMS                         | Governance policy created; evidence map created                                             | No formal AIMS manual; no management review cycle scheduled                                         | ⚠️     | CRM team | Enterprise   |
| 4.5 — AI system impact assessment                                | Assess the impact of the AI system on individuals and society               | Human approval gate documented; data boundaries enforced                                    | No formal impact assessment document (separate from governance policy); no societal impact analysis | ❌     | CRM team | Enterprise   |

---

## Clause 5 — Leadership

| Control                                        | Requirement                                        | Current state                                     | Gap                                                                                               | Status | Owner         | Target phase |
| ---------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ | ------------- | ------------ |
| 5.1 — Leadership and commitment                | Top management demonstrates commitment to the AIMS | Governance policy authored by CRM team            | No formal management sign-off on AI governance policy; no designated AI management representative | ❌     | Founding team | Enterprise   |
| 5.2 — AI policy                                | Establish and communicate an AI policy             | AI governance policy document created (this repo) | No external publication of policy; no version-controlled policy acceptance records                | ⚠️     | CRM team      | Enterprise   |
| 5.3 — Roles, responsibilities, and authorities | Define and assign AI management roles              | Responsibility implicit in team structure         | No RACI matrix; no formally designated AI Officer or equivalent                                   | ❌     | CRM team      | Enterprise   |

---

## Clause 6 — Planning

| Control                                          | Requirement                                            | Current state                                                              | Gap                                                                                                           | Status | Owner    | Target phase |
| ------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ | -------- | ------------ |
| 6.1 — Actions to address risks and opportunities | Perform AI risk assessment; address risks with actions | Human approval gate, schema validation, prompt injection controls in place | No formal risk register (likelihood × impact × residual risk matrix); no documented risk acceptance decisions | ⚠️     | CRM team | Enterprise   |
| 6.1.2 — AI risk assessment                       | Identify, analyse, and evaluate AI risks               | Prompt injection threats documented in governance policy §5                | Risk assessment not in standard format (no likelihood/impact ratings, no acceptance criteria documented)      | ⚠️     | CRM team | Enterprise   |
| 6.1.3 — AI risk treatment                        | Select and implement risk treatment options            | Technical controls implemented (truncation, human gate, schema validation) | No formal risk treatment plan document mapping controls to risks                                              | ⚠️     | CRM team | Enterprise   |
| 6.2 — AI objectives and planning                 | Establish measurable AI objectives                     | Bundle size budgets enforced; human approval gate enforced                 | No documented AI performance objectives (accuracy, helpfulness, harm rate)                                    | ⚠️     | CRM team | Enterprise   |
| 6.3 — Planning of changes                        | Manage changes to the AIMS in a controlled manner      | All changes go through PR process with CHANGELOG update                    | No change impact assessment specific to AIMS changes; no AIMS change log separate from CHANGELOG              | ⚠️     | CRM team | Enterprise   |

---

## Clause 7 — Support

| Control                      | Requirement                                       | Current state                                          | Gap                                                                                           | Status | Owner         | Target phase |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------ | ------------- | ------------ |
| 7.1 — Resources              | Determine and provide resources for the AIMS      | Development and review resources available             | No formal resource allocation plan for ongoing AIMS maintenance                               | ⚠️     | Founding team | Enterprise   |
| 7.2 — Competence             | Ensure persons performing AIMS work are competent | Team has AI development and security review experience | No competence record or training log; no documented AI ethics training requirement            | ❌     | CRM team      | Enterprise   |
| 7.3 — Awareness              | Ensure awareness of the AI policy                 | Policy is in the repo and visible to contributors      | No onboarding requirement to read/acknowledge policy; no awareness check for new contributors | ❌     | CRM team      | Enterprise   |
| 7.4 — Communication          | Determine internal and external AI communication  | This document and governance policy are internal comms | No external communication plan (e.g. user-facing AI transparency notice, model disclosure)    | ❌     | CRM team      | Enterprise   |
| 7.5 — Documented information | Maintain required documented information          | Governance policy and evidence map maintained in repo  | No document control procedure (versioning, approval, distribution, retention periods)         | ⚠️     | CRM team      | Enterprise   |

---

## Clause 8 — Operation

| Control                                             | Requirement                                       | Current state                                                                                   | Gap                                                                                                                           | Status | Owner    | Target phase |
| --------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | ------------ |
| 8.1 — Operational planning and control              | Plan, implement, and control processes for AI     | Build pipeline gates, human approval, schema validation all implemented                         | No formal operational procedure document for AI incidents                                                                     | ⚠️     | CRM team | Enterprise   |
| 8.2 — AI risk assessment (operational)              | Carry out AI risk assessment at defined intervals | Governance policy addresses risk at design time                                                 | No recurring operational risk assessment schedule                                                                             | ❌     | CRM team | Enterprise   |
| 8.3 — AI system impact assessment                   | Assess impact before operational changes          | Data boundary and prompt injection impact documented                                            | Impact assessment not tied to a change control gate; no formal sign-off required before deploying new AI model                | ⚠️     | CRM team | Enterprise   |
| 8.4 — Data for AI systems                           | Control data used with the AI system              | CRM data boundary rules enforce what reaches AI context; field truncation; `<crm_data>` tagging | No data lineage documentation for AI training data (N/A for on-device models); no data quality controls for injected CRM data | ⚠️     | CRM team | 10 (partial) |
| 8.5 — Information for the development of AI systems | Maintain information about the AI system          | Model inventory maintained in governance policy                                                 | No formal model card for each model; no training data provenance record                                                       | ⚠️     | CRM team | Enterprise   |
| 8.6 — AI system requirements                        | Specify AI system requirements                    | AI tool catalog, system prompt, and deployment policy all documented                            | No formal requirements specification document separate from code comments                                                     | ⚠️     | CRM team | Enterprise   |
| 8.7 — AI system design and development              | Manage design and development of AI systems       | Architecture documented in ADRs; modular AI layer in `packages/core/src/ai/`                    | No formal design review checklist for AI features                                                                             | ⚠️     | CRM team | Enterprise   |
| 8.8 — AI system verification and validation         | Verify and validate AI systems                    | Prompt injection stub tests created (Phase 10); schema validation active                        | No test coverage for AI accuracy, hallucination rate, or refusal behaviour                                                    | ⚠️     | CRM team | Enterprise   |
| 8.9 — AI system performance monitoring              | Monitor AI system performance in production       | OTel design includes AI gateway metrics (Phase 9)                                               | No live monitoring of AI accuracy, user rejection rate, or prompt injection attempts in current offline profile               | ⚠️     | CRM team | 9            |
| 8.10 — Record of AI systems                         | Maintain records of AI system activities          | Audit log captures AI-triggered mutations (via `audit.ts`)                                      | Audit log does not capture: model responses, token counts, session duration, or rejection events                              | ⚠️     | CRM team | Enterprise   |

---

## Clause 9 — Performance evaluation

| Control                                                 | Requirement                                  | Current state                                                                           | Gap                                                                          | Status | Owner         | Target phase |
| ------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ | ------------- | ------------ |
| 9.1 — Monitoring, measurement, analysis, and evaluation | Define what, how, and when to monitor        | SLO definitions in `docs/architecture/0008-observability.md` include AI gateway metrics | No monitoring criteria specific to AI fairness, reliability, or refusal rate | ⚠️     | CRM team      | 9            |
| 9.2 — Internal audit                                    | Conduct periodic internal audits of the AIMS | This self-assessment serves as first audit                                              | No formal audit programme; no independent audit of AI governance             | ❌     | CRM team      | Enterprise   |
| 9.3 — Management review                                 | Top management reviews the AIMS              | No formal management review conducted yet                                               | No management review schedule; no management review input/output record      | ❌     | Founding team | Enterprise   |

---

## Clause 10 — Improvement

| Control                                    | Requirement                                              | Current state                                      | Gap                                                                     | Status | Owner    | Target phase |
| ------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- | ------ | -------- | ------------ |
| 10.1 — Continual improvement               | Continually improve the AIMS                             | CHANGELOG.md tracks AI feature improvements        | No formal improvement plan with objectives, timelines, and owners       | ⚠️     | CRM team | Enterprise   |
| 10.2 — Nonconformity and corrective action | React to nonconformities and implement corrective action | PRs required for all changes; code review enforced | No nonconformity log; no root cause analysis procedure for AI incidents | ❌     | CRM team | Enterprise   |

---

## Annex A controls (selected)

ISO 42001 Annex A provides implementation guidance controls. The following are relevant to Task App CRM:

| Annex A control | Title                                               | Current state                                                                 | Gap                                                                                   | Status |
| --------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| A.2.2           | Policies for human oversight of AI systems          | Human approval gate for all mutating AI actions (governance policy §4)        | No documented exception procedure for when human approval is impractical              | ⚠️     |
| A.2.3           | Documentation of AI systems for users               | This governance policy + CLAUDE.md                                            | No user-facing transparency disclosure (e.g. in-app notice that AI features are used) | ⚠️     |
| A.2.6           | Responsible use of AI systems                       | Data boundary rules, prompt injection controls (governance policy §3, §5)     | No Acceptable Use Policy for end-users                                                | ❌     |
| A.3.3           | Allocation of responsibilities for AI system impact | AI-triggered mutations require user confirmation                              | No formal allocation of legal liability for AI errors                                 | ❌     |
| A.4.2           | Logging and monitoring of AI systems                | Audit log for AI mutations; OTel design for AI gateway                        | AI session history not persisted; no anomaly detection on AI tool call patterns       | ⚠️     |
| A.5.2           | Data quality for AI systems                         | Field truncation; schema validation of tool args                              | No formal data quality assessment of CRM data that reaches AI context                 | ⚠️     |
| A.6.1           | Avoiding harmful bias in AI output                  | On-device models with vendor safety training                                  | No bias testing or fairness evaluation for AI responses to CRM data                   | ❌     |
| A.9.2           | Transparency of AI systems to users                 | Built-in AI modal shows download disclaimer and model info                    | No persistent in-app notice explaining AI data handling to users                      | ⚠️     |
| A.10.4          | Security of AI systems                              | Prompt injection controls; schema validation; no network access from AI tools | No penetration test of AI layer; prompt injection test suite marked .todo             | ⚠️     |

---

## Summary scorecard

| Clause                     | Controls assessed | ✅ Conformant | ⚠️ Partial | ❌ Not addressed | 🔵 N/A |
| -------------------------- | ----------------- | ------------- | ---------- | ---------------- | ------ |
| 4 — Context                | 5                 | 0             | 2          | 3                | 0      |
| 5 — Leadership             | 3                 | 0             | 1          | 2                | 0      |
| 6 — Planning               | 5                 | 0             | 5          | 0                | 0      |
| 7 — Support                | 5                 | 0             | 2          | 3                | 0      |
| 8 — Operation              | 10                | 0             | 9          | 1                | 0      |
| 9 — Performance evaluation | 3                 | 0             | 1          | 2                | 0      |
| 10 — Improvement           | 2                 | 0             | 1          | 1                | 0      |
| Annex A (selected)         | 10                | 0             | 6          | 4                | 0      |
| **Total**                  | **43**            | **0**         | **27**     | **16**           | **0**  |

**Overall maturity:** Initial (Level 1 of 5). Controls are technically sound for the offline single-user profile, but the formal management system documentation, roles, and review cycles required for certification do not yet exist.

**Priority gaps for next review:**

1. Formal management commitment and AI policy sign-off (Clause 5)
2. AI risk register in standard format (Clause 6.1)
3. Interested party and regulatory requirements register (Clause 4.2)
4. Nonconformity and corrective action procedure (Clause 10.2)
5. User-facing AI transparency notice (Annex A.9.2)
