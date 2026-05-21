# Task App CRM — Feature Implementation Prompts (2026)

Generated: 2026-05-21  
Total prompts: 28  
Covers: all gap features, AI agentic integration, compliance (HIPAA/EU AI Act/SOC 2/CCPA), mobile, Dataverse, and full UI redesign.

> **Read CLAUDE.md in full before running any prompt. All security rules in that file are non-negotiable.**

---

## Sequence Guide

| Phase               | Prompts | Description                                                                   |
| ------------------- | ------- | ----------------------------------------------------------------------------- |
| A — Foundation      | P1–P2   | Vertical profiles, custom fields, deals schema                                |
| B — Core CRM        | P3–P6   | Pipeline/Kanban, forecasting, lead scoring, automation                        |
| C — AI Integration  | P7–P8   | Agentic AI loop, duplicate detection                                          |
| D — Data & Input    | P9–P13  | Voice, CSV import, omnichannel, email integration                             |
| E — Platform Builds | P14–P15 | Mobile (Capacitor), Dataverse adapter                                         |
| F — Compliance      | P16–P19 | HIPAA, EU AI Act, SOC 2, CCPA                                                 |
| G — UI Foundation   | P20     | Design tokens, component library, accessibility                               |
| H — UI Core Screens | P21–P25 | Command Center, Record 360, AI Workbench, Command Palette, Relationship Graph |
| I — UI Advanced     | P26–P28 | Reports, Agent Layer, Advanced Intelligence                                   |

---

## Dependencies

```
P1 → P2 → P3, P4, P5, P6
P5, P6 → P7 → P8
P7, P11 → P12
P1, P8 → P10
P1, P2 → P15
P1, P7, P9, P10 → P16
P5, P6, P7 → P17
P6, P7 → P18
P16 → P19
P20 → P21, P22, P23, P24, P25, P26
P20, P5, P7, P6 → P21
P20, P6, P7 → P23
P20, P23 → P24
P20, P22 → P25
P20, P4, P5 → P26
P23, P6 → P27
P7, P23, P27 → P28
```

---

_Prompts are stored in the featureadd.md_
