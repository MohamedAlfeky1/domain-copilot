# Teaching Assessment Map

This document maps learning outcomes, teaching topics, laboratory exercises, stretch activities, assessment criteria, and ITI Technical Assessment requirements to the Domain Copilot teaching pack.

## Table of Contents

- [1. Purpose and Scope](#1-purpose-and-scope)
  - [1.1 Purpose](#11-purpose)
  - [1.2 Audience](#12-audience)
  - [1.3 Relationship to the Teaching Pack](#13-relationship-to-the-teaching-pack)
  - [1.4 Assessment Context](#14-assessment-context)
- [2. Teaching Context](#2-teaching-context)
  - [2.1 Domain](#21-domain)
  - [2.2 D0 Healthcare](#22-d0-healthcare)
  - [2.3 T1 Bilingual Arabic + English](#23-t1-bilingual-arabic--english)
  - [2.4 Intended Learner Profile](#24-intended-learner-profile)
  - [2.5 Teaching Duration](#25-teaching-duration)
- [3. Learning Outcomes](#3-learning-outcomes)
- [4. Learning Outcome → Teaching Content Mapping](#4-learning-outcome--teaching-content-mapping)
- [5. Learning Outcome → Lab Mapping](#5-learning-outcome--lab-mapping)
- [6. Learning Outcome → Assessment Mapping](#6-learning-outcome--assessment-mapping)
  - [6.1 Assessment Matrix](#61-assessment-matrix)
  - [6.2 Evaluation Context Separation (Teaching Lab vs Production Baseline)](#62-evaluation-context-separation-teaching-lab-vs-production-baseline)
- [7. ITI Requirement Traceability](#7-iti-requirement-traceability)
  - [7.1 Traceability Matrix](#71-traceability-matrix)
  - [7.2 Official ITI Requirements vs Internal Story Identifiers](#72-official-iti-requirements-vs-internal-story-identifiers)
- [8. 90-Minute Teaching Flow](#8-90-minute-teaching-flow)
- [9. Assessment Strategy](#9-assessment-strategy)
  - [9.1 Demonstration of Understanding](#91-demonstration-of-understanding)
  - [9.2 Measurement of Practical Competence](#92-measurement-of-practical-competence)
  - [9.3 Diagnostic Remediation (Identifying Weak Areas)](#93-diagnostic-remediation-identifying-weak-areas)
- [10. Stretch / Advanced Path](#10-stretch--advanced-path)
- [11. Answer Key / Instructor Evidence Mapping](#11-answer-key--instructor-evidence-mapping)
- [12. Coverage Summary](#12-coverage-summary)
- [13. Gaps and Improvements](#13-gaps-and-improvements)
- [14. Related Documents](#14-related-documents)

---

## 1. Purpose and Scope

### 1.1 Purpose

The purpose of this document is to provide a comprehensive, auditable assessment map for the Domain Copilot masterclass curriculum. It defines:
1. What capabilities learners acquire during the 90-minute masterclass.
2. Which specific slides, code walkthroughs, and instructional modules deliver the theoretical foundations.
3. How hands-on laboratory exercises provide practical reinforcement.
4. What verifiable evidence demonstrates learner mastery.
5. How each pedagogical element traces directly to the official ITI Technical Assessment requirements.

### 1.2 Audience

This map is designed for:
- **ITI Technical Assessors**: Evaluating curriculum alignment, architectural rigor, and artifact completeness against assessment standards.
- **Instructors and Workshop Facilitators**: Structuring lecture pacing, guiding lab execution, and grading student submissions.
- **Learners and Engineers**: Understanding evaluation criteria, expected outputs, and extension challenges.

### 1.3 Relationship to the Teaching Pack

This document serves as the central navigational index for the existing artifacts in the `teaching/` directory:
- [teaching/slides.md](./slides.md): 20-slide visual lecture deck for the 90-minute masterclass.
- [teaching/lab-sheet.md](./lab-sheet.md): 6-part hands-on student lab worksheet.
- [teaching/stretch-challenges.md](./stretch-challenges.md): 3 advanced engineering challenges with complete solutions.
- [teaching/expected-outputs.md](./expected-outputs.md): Verbatim terminal outputs and JSON responses for lab verification.
- [teaching/common-mistakes.md](./common-mistakes.md): Guide to 5 critical industry misconceptions and architectural corrections.
- [teaching/video-teaching-script.md](./video-teaching-script.md): Technical script and recording plan for the ~10-minute lecture (VIDEO-002).
- [teaching/video-demo-script.md](./video-demo-script.md): Storyboard and narration script for the 5–8 minute product demo (VIDEO-001).

### 1.4 Assessment Context

The curriculum directly addresses the challenges of building production-ready AI systems in regulated environments where naive RAG implementations fail due to table severance, lexical blindness, hallucinations under uncertainty, and unconstrained agent agency.

---

## 2. Teaching Context

### 2.1 Domain

The platform and curriculum are configured for **Domain D0: Healthcare**, paired with **Mandatory Twist T1: Bilingual Arabic + English**.

### 2.2 D0 Healthcare

Clinical AI environments demand absolute evidence grounding, zero tolerance for ungrounded hallucination, strict contraindication auditing, and mandatory human authorization for consequential medical actions (e.g., protocol updates, dosage ceiling revisions).

### 2.3 T1 Bilingual Arabic + English

The T1 Twist introduces native cross-lingual hybrid retrieval across Arabic and English clinical documents using shared multilingual vector embeddings (`text-embedding-3-small` / Gemini 1536d), dual PostgreSQL Full-Text Search dictionaries (`english` and `simple`), Unicode language detection (`[\u0600-\u06FF]`), and bi-directional RTL rendering.

### 2.4 Intended Learner Profile

- **Target Audience**: Postgraduate software engineers, senior full-stack developers, and AI systems architects.
- **Prerequisites**: Proficiency in TypeScript/JavaScript, familiarity with relational databases (SQL) and vector embeddings, and an understanding of client-server web architectures.

### 2.5 Teaching Duration

- **Format**: 90-minute interactive masterclass combining technical lecture (45 minutes) and hands-on laboratory implementation (45 minutes).
- **Supporting Media**: Accompanied by a 10-minute recorded teaching video (`VIDEO-002`) and a 6.5-minute product demonstration video (`VIDEO-001`).

---

## 3. Learning Outcomes

The curriculum supports 9 measurable Learning Outcomes (LOs) derived from the core architecture and official ITI requirements:

| LO ID | Learning Outcome | Expected Learner Capability |
|---|---|---|
| **LO-01** | **Architectural Boundary Enforcement** | Verify and enforce Clean Architecture hexagonal boundaries using automated AST linting, ensuring zero external framework imports in the Domain Core. |
| **LO-02** | **Structure-Aware Document Ingestion** | Ingest, validate, and segment clinical documents into semantic chunks (300–800 tokens) with deterministic SHA-256 hashes while auditing for PII compliance. |
| **LO-03** | **Hybrid Retrieval & Rank Fusion** | Implement and execute dual-channel hybrid search (dense pgvector cosine `<=>` + sparse PostgreSQL FTS `ts_rank_cd`), fusing results via Reciprocal Rank Fusion ($RRF\ k=60$). |
| **LO-04** | **Deterministic Evidence Grounding & Refusal** | Formulate and verify an architectural low-evidence refusal gate ($RRF < 0.015$) that returns typed refusal responses on ungrounded queries without hallucination. |
| **LO-05** | **Multi-Agent Supervisor State Machine** | Trace and govern sequential specialist agents (Extractor, Auditor, Drafter) bounded by Zod schema contracts, 5-iteration caps, and 30s step timeouts. |
| **LO-06** | **Bilingual Cross-Lingual RAG (Twist T1)** | Apply Unicode language detection, cross-lingual vector retrieval, dual FTS dictionary routing (`simple`/`english`), and bi-directional RTL rendering. |
| **LO-07** | **Human-in-the-Loop (HITL) Governance** | Intercept consequential actions into a two-phase commit approval queue (`/reviews`) and resume execution using cryptographically signed approval tokens. |
| **LO-08** | **Prompt Injection Hardening & Sandboxing** | Implement structural XML context delimiters, boundary sanitization, and role-based tool allowlists to mitigate direct and indirect prompt injection attacks. |
| **LO-09** | **Full-Stack Observability & Evaluation** | Track end-to-end execution latency via waterfall traces, calculate financial token costs in `usage_ledger`, and run automated golden Q/A benchmarks. |

---

## 4. Learning Outcome → Teaching Content Mapping

| LO ID | Topic / Session | Teaching Content | Teaching Method | Evidence |
|---|---|---|---|---|
| **LO-01** | Part 1: Clean Architecture | Hexagonal purity, Domain vs Application vs Infrastructure separation, dependency inversion. | Slide presentation & code inspection (`scripts/lint-arch.js`). | [slides.md: Slide 4](./slides.md#slide-4-clean-architecture--hexagonal-purity)<br>[video-teaching-script.md: Seg 1](./video-teaching-script.md#segment-1-the-core-problem-why-dense-only-rag-fails-in-production-000--130) |
| **LO-02** | Part 2: Ingestion Pipeline | 5-stage ingestion pipeline, semantic paragraph chunking, SHA-256 deduplication, PII regex auditing. | Slide presentation & terminal walkthrough. | [slides.md: Slide 5](./slides.md#slide-5-structure-aware-document-ingestion-pipeline)<br>[video-demo-script.md: Scene 2](./video-demo-script.md#scene-2-structure-aware-document-ingestion--storage-050--155) |
| **LO-03** | Part 2: Hybrid Search & RRF | Dense cosine `<=>` in pgvector, sparse `ts_rank_cd` in PostgreSQL FTS, mathematical RRF formulation ($k=60$). | Digital whiteboard derivation & SQL code review. | [slides.md: Slides 6–8](./slides.md#slide-6-dense-vector-cosine-similarity-search-pgvector)<br>[video-teaching-script.md: Seg 2](./video-teaching-script.md#segment-2-mathematical-deep-dive-hybrid-search--reciprocal-rank-fusion-130--400) |
| **LO-04** | Part 2: Refusal Gate | The Zero Hallucination principle, mathematical refusal floor ($RRF < 0.015$), ungrounded query handling. | Slide presentation & live query execution. | [slides.md: Slide 9](./slides.md#slide-9-the-low-evidence-refusal-gate--0015-floor)<br>[video-demo-script.md: Scene 4](./video-demo-script.md#scene-4-the-low-evidence-refusal-gate-315--410) |
| **LO-05** | Part 3: Agent Orchestration | Multi-agent supervisor pattern, Zod output schemas, iterative self-correction, 5-round circuit breaker. | Architecture diagram & VS Code code walkthrough (`orchestrator.service.ts`). | [slides.md: Slides 11–14](./slides.md#slide-11-multi-agent-supervisor-state-machine-architecture)<br>[video-teaching-script.md: Seg 3](./video-teaching-script.md#segment-3-deterministic-multi-agent-state-machines--circuit-breakers-400--630) |
| **LO-06** | Part 4: Mandatory Twist T1 | Unicode block detection (`\u0600-\u06FF`), cross-lingual embeddings, `simple` vs `english` FTS, RTL rendering. | Code walkthrough (`twist.adapter.ts`) & UI demonstration. | [slides.md: Slide 15](./slides.md#slide-15-mandatory-twist-t1-bilingual-arabic--english-aren)<br>[video-teaching-script.md: Seg 4](./video-teaching-script.md#segment-4-the-mandatory-twist-enforcing-hard-risk-ceilings-630--830) |
| **LO-07** | Part 4: HITL Governance | Two-phase commit pattern, pending approval state, reviewer queue, cryptographic single-use approval tokens. | Flow diagram & live web UI walkthrough (`/reviews`). | [slides.md: Slide 16](./slides.md#slide-16-human-in-the-loop-hitl-governance--tokens)<br>[video-demo-script.md: Scene 5](./video-demo-script.md#scene-5-consequential-action--mandatory-twist-risk-guard-410--525) |
| **LO-08** | Part 5: Security & Injection | Direct jailbreak neutralization, XML boundary delimiter escaping (`&lt;/untrusted_evidence&gt;`), tool allowlists. | Code walkthrough & adversarial test review (`scripts/test-security.js`). | [slides.md: Slide 17](./slides.md#slide-17-prompt-injection-defenses--boundary-isolation)<br>[video-teaching-script.md: Seg 5](./video-teaching-script.md#segment-5-testing--verifying-ai-systems-without-cloud-credentials-830--1030) |
| **LO-09** | Part 5: Observability & Eval | Correlation ID propagation (`OBS-001`), token cost accounting (`OBS-002`), trace waterfalls (`OBS-003`), golden Q/A benchmarks. | Live dashboard inspection (`/runs`, `/eval`) & terminal benchmark run. | [slides.md: Slides 18–19](./slides.md#slide-18-real-time-sse-streaming-with-heartbeat-resilience)<br>[video-demo-script.md: Scene 6](./video-demo-script.md#scene-6-trace-inspector-token-ledger--evaluation-harness-525--630) |

---

## 5. Learning Outcome → Lab Mapping

| LO ID | Lab Exercise | Learner Task | Expected Output | Verification |
|---|---|---|---|---|
| **LO-01** | **Exercise 1 (Core)**: Architecture Boundary Linter | Run `npm run lint:arch` and verify zero external imports in `src/core/domain/types.ts`. | Terminal log: `Zero forbidden external framework imports found in Domain layer. Domain purity check PASSED!`. | [expected-outputs.md: Ex 1](./expected-outputs.md#exercise-1-architecture-boundary-linter)<br>[lab-sheet.md: Ex 1](./lab-sheet.md#exercise-1-clean-architecture-verification-10-mins) |
| **LO-02** | **Exercise 2 (Core)**: Corpus Seeding & Validation | Execute `npm run seed:corpus` followed by `npm run test:corpus` to verify document and page floors. | Terminal log: `Documents count: 32 (Required: >= 30) -> PASS`, `Pages count: 197 (Required: >= 150) -> PASS`, `PII Audit: PASS`. | [expected-outputs.md: Ex 2](./expected-outputs.md#exercise-2-corpus-validation)<br>[lab-sheet.md: Ex 2](./lab-sheet.md#exercise-2-corpus-seeding--validation-15-mins) |
| **LO-03** | **Exercise 3 (Core)**: Grounded Query Execution | Submit clinical query on `/copilot`, observe multi-agent progress rail, and inspect chunk evidence in drawer. | Live streaming response with inline citations `[Doc: ..., p. ..., Section ...]`; source drawer reveals verbatim chunk. | [lab-sheet.md: Ex 3](./lab-sheet.md#exercise-3-running-the-application--testing-grounded-queries-25-mins)<br>[video-demo-script.md: Scene 3](./video-demo-script.md#scene-3-copilot-querying-hybrid-rrf--grounded-citations-155--315) |
| **LO-04** | **Exercise 4 (Core)**: Low-Evidence Refusal | Submit out-of-corpus query (*"What is the capital city of planet Neptune?"*) on `/copilot`. | Refusal banner: `status: REFUSED`, `citations: []`, explanation of insufficient evidence without hallucination. | [expected-outputs.md: Ex 4](./expected-outputs.md#exercise-4-low-evidence-refusal-response)<br>[lab-sheet.md: Ex 4](./lab-sheet.md#exercise-4-testing-low-evidence-refusal-15-mins) |
| **LO-05** | **Exercise 3 (Core)**: Multi-Agent Progress Inspection | Observe the Multi-Agent Progress Rail advance through Retrieval -> Specialist 1 -> Specialist 2 -> Specialist 3. | Sequential progression indicators update in real time with millisecond latency timers. | [lab-sheet.md: Ex 3](./lab-sheet.md#exercise-3-running-the-application--testing-grounded-queries-25-mins) |
| **LO-06** | **Exercise 3 (Core / Optional Extension)**: Arabic Query Execution | Submit an Arabic clinical query (e.g. *"ما هي موانع استعمال بروتوكول القلب؟"*) on `/copilot`. | UI applies `dir="auto"` RTL layout; cross-lingual hybrid retrieval retrieves relevant Arabic/English chunks. | [twist.adapter.ts](file:///c:/Users/LOQ/domain-copilot/src/infrastructure/twist/twist.adapter.ts)<br>[video-demo-script.md: Scene 5](./video-demo-script.md#scene-5-consequential-action--mandatory-twist-risk-guard-410--525) |
| **LO-07** | **Exercise 5 (Core)**: HITL Consequential Action | Navigate to `/reviews`, inspect pending protocol update, edit JSON parameters, and click Approve. | Action executes with modified parameters; run updates to `COMPLETED`; audit entry logged in `approval_events`. | [lab-sheet.md: Ex 5](./lab-sheet.md#exercise-5-hitl-consequential-action-governance-15-mins)<br>[video-demo-script.md: Scene 5](./video-demo-script.md#scene-5-consequential-action--mandatory-twist-risk-guard-410--525) |
| **LO-09** | **Exercise 6 (Core)**: Golden Benchmark Evaluation | Run `npm run eval` to execute automated benchmark against PGlite/pgvector. | Terminal log: `Total Cases: 26`, `Pass Rate: 100%`, `Average Latency: 265ms`, `Total Cost: $0.01170`. | [expected-outputs.md: Ex 6](./expected-outputs.md#exercise-6-golden-benchmark-evaluation-output)<br>[lab-sheet.md: Ex 6](./lab-sheet.md#exercise-6-golden-benchmark-evaluation-10-mins) |
| **LO-03** | **Stretch 1 (Optional)**: Dynamic Top-K Adaptive Retrieval | Modify `retrieval.service.ts` to scale `topK` from 5 to 12 when query entropy/length indicates ambiguity. | Unit tests pass; retrieval trace reflects 12 candidates for short queries. | [stretch-challenges.md: Challenge 1](./stretch-challenges.md#stretch-challenge-1-dynamic-top-k-adaptive-retrieval) |
| **LO-07** | **Stretch 2 (Optional)**: Cryptographically Signed Approval Tokens | Implement HMAC-SHA256 token signing in `approval.service.ts` to prevent internal token forgery. | Signed token format `appr-token-<hex>`; verification rejects altered timestamps or approval IDs. | [stretch-challenges.md: Challenge 2](./stretch-challenges.md#stretch-challenge-2-cryptographically-signed-approval-tokens) |
| **LO-08** | **Stretch 3 (Optional)**: Negative Ingestion Security Filter | Add regex scanner in `ingestion.service.ts` to reject documents containing override directives. | Ingestion pipeline throws `IngestionFailedError` when test document contains injection triggers. | [stretch-challenges.md: Challenge 3](./stretch-challenges.md#stretch-challenge-3-negative-ingestion-security-filter) |

---

## 6. Learning Outcome → Assessment Mapping

### 6.1 Assessment Matrix

| LO ID | Assessment Method | Assessment Task | Evidence Produced | Success Criterion | Status |
|---|---|---|---|---|---|
| **LO-01** | Automated AST Lint Check | Execute `npm run lint:arch` in terminal. | Linter console output. | Zero forbidden imports detected; exit code 0. | **Complete** |
| **LO-02** | Automated Corpus Test Suite | Execute `npm run test:corpus` in terminal. | Test report console output. | Document count $\ge 30$, page count $\ge 150$, 0 PII violations detected. | **Complete** |
| **LO-03** | Live Query Inspection & Citation Audit | Query copilot via UI; click citation chip to open evidence drawer. | UI screenshot / DOM state of citation modal. | Verbatim excerpt in drawer matches cited chunk in database; inline citation tag formatted properly. | **Complete** |
| **LO-04** | Negative Refusal Test | Submit ungrounded query via UI or API. | JSON response or UI refusal card. | `status === "REFUSED"`, empty citations array, explanation provided, 0 hallucinated facts. | **Complete** |
| **LO-05** | Multi-Agent Trace Inspection | Open `/runs/:id` trace inspector for completed query. | Waterfall UI showing step latencies and payloads. | All 3 specialists (Extractor, Auditor, Drafter) executed in sequence; step latencies recorded; Zod validation passed. | **Complete** |
| **LO-06** | Cross-Lingual & RTL Inspection | Query copilot in Arabic; observe response and rendering. | UI screenshot of Arabic query and response. | `dir="auto"` active; RTL layout applied; Arabic text retrieved from English/Arabic corpus via shared vector space. | **Partial** *(Taught in lecture/video; optional in core lab)* |
| **LO-07** | HITL State Machine Verification | Trigger consequential action, edit payload in `/reviews`, and approve. | Database `approval_events` record & updated run status. | Request status transitions `PENDING` $\rightarrow$ `APPROVED`; modified payload committed; approval token verified. | **Complete** |
| **LO-08** | Adversarial Security Suite | Execute `npm run test:security` in terminal. | Security test runner output. | 100% pass rate across direct jailbreak and indirect XML delimiter escape test cases. | **Complete** |
| **LO-09** | Benchmark Evaluation & Ledger Audit | Run `npm run eval` and inspect `/runs` token ledger. | `fixtures/eval-results.json` & `/runs` cost display. | Pass rate $\ge 80\%$, retrieval recall $\ge 80\%$, refusal precision 100%, per-step USD cost calculated. | **Complete** |

### 6.2 Evaluation Context Separation (Teaching Lab vs Production Baseline)

To prevent confusion between pedagogical training runs and production engineering baselines, the two evaluation contexts are explicitly differentiated:

| Attribute | Student Teaching / Lab Benchmark | Current Production Evaluation Baseline |
|---|---|---|
| **Artifact Source** | `teaching/expected-outputs.md` (Exercise 6) | `fixtures/eval-results.json` & `docs/EVALUATION.md` |
| **Primary Purpose** | Fast hands-on student lab verification during class | Comprehensive engineering regression & ITI compliance baseline |
| **Runtime Environment** | In-process `@electric-sql/pglite` with mock embeddings | Containerized PostgreSQL 16 + pgvector with real model inference |
| **Test Set Size** | **26 test cases** (20 grounded clinical questions + 6 adversarial cases) | **33 test cases** (27 domain clinical questions + 6 adversarial cases) |
| **Pass Rate** | **100%** (26/26 passing in lab fixture) | **90.9%** (30/33 passing; 3 clinical edge cases analyzed in documentation) |
| **Average Latency** | **265ms** (fast local execution) | **486ms** (full pipeline with network inference) |
| **Total / Avg Cost** | **$0.01170** total cost for suite | **$0.00762** average cost per individual run |

---

## 7. ITI Requirement Traceability

### 7.1 Traceability Matrix

| Official ITI Requirement (Assessment Brief) | Internal Story ID | Learning Outcome | Teaching Activity | Lab | Assessment | Evidence | Status |
|---|---|---|---|---|---|---|---|
| **Clean Architecture Module Boundaries** | `DEV-001` | LO-01 | Slide 4; Video Teaching Seg 1 | [lab-sheet.md: Ex 1](./lab-sheet.md#exercise-1-clean-architecture-verification-10-mins) | `npm run lint:arch` | [expected-outputs.md: Ex 1](./expected-outputs.md#exercise-1-architecture-boundary-linter) | **Complete** |
| **Document Ingestion, Chunking & Corpus Seeder** ($\ge 30$ docs, $\ge 150$ pages) | `ING-001`, `ING-003`, `ING-008` | LO-02 | Slide 5; Video Demo Scene 2 | [lab-sheet.md: Ex 2](./lab-sheet.md#exercise-2-corpus-seeding--validation-15-mins) | `npm run test:corpus` | [expected-outputs.md: Ex 2](./expected-outputs.md#exercise-2-corpus-validation) | **Complete** |
| **Grounded Hybrid Retrieval (Dense + Sparse) with RRF** ($k=60$) | `RET-001`, `RET-006` | LO-03 | Slides 6–8; Video Teaching Seg 2 | [lab-sheet.md: Ex 3](./lab-sheet.md#exercise-3-running-the-application--testing-grounded-queries-25-mins) | Live query citations; `npm run test:retrieval` | [video-demo-script.md: Scene 3](./video-demo-script.md#scene-3-copilot-querying-hybrid-rrf--grounded-citations-155--315) | **Complete** |
| **Low-Evidence Refusal Floor** ($RRF < 0.015$) | `RET-004` | LO-04 | Slide 9; Video Demo Scene 4 | [lab-sheet.md: Ex 4](./lab-sheet.md#exercise-4-testing-low-evidence-refusal-15-mins) | Out-of-corpus query refusal check | [expected-outputs.md: Ex 4](./expected-outputs.md#exercise-4-low-evidence-refusal-response) | **Complete** |
| **Typed Agent Contracts & Supervisor State Machine** | `AGT-001` to `AGT-005` | LO-05 | Slides 11–14; Video Teaching Seg 3 | [lab-sheet.md: Ex 3](./lab-sheet.md#exercise-3-running-the-application--testing-grounded-queries-25-mins) | Trace waterfall inspection; `npm run test:integration` | `/runs/:id`; `orchestrator.service.ts` | **Complete** |
| **Mandatory Twist T1: Bilingual Arabic + English** | `TW-001` to `TW-006` | LO-06 | Slide 15; Video Teaching Seg 4 | UI demonstration in `/copilot` | Dynamic RTL & cross-lingual retrieval audit | `twist.adapter.ts`; [video-demo-script.md: Scene 5](./video-demo-script.md#scene-5-consequential-action--mandatory-twist-risk-guard-410--525) | **Partial** *(Taught; optional in lab)* |
| **Human-in-the-Loop Approval Gate & Safe Tools** | `HITL-001` to `HITL-006`, `AGT-006` | LO-07 | Slide 16; Video Demo Scene 5 | [lab-sheet.md: Ex 5](./lab-sheet.md#exercise-5-hitl-consequential-action-governance-15-mins) | Edit-and-approve action resolution in `/reviews` | `approval_events` table; `npm run test:hitl` | **Complete** |
| **Prompt Injection Defense & OWASP LLM Controls** | `DEV-008`, `OBS-005` | LO-08 | Slide 17; Video Teaching Seg 5 | [stretch-challenges.md: Challenge 3](./stretch-challenges.md#stretch-challenge-3-negative-ingestion-security-filter) | Adversarial test suite (`npm run test:security`) | 100% pass across 7 injection cases | **Complete** |
| **Observability Waterfall, Cost Ledger & Evaluation** | `OBS-001` to `OBS-004`, `OBS-007` | LO-09 | Slides 18–19; Video Demo Scene 6 | [lab-sheet.md: Ex 6](./lab-sheet.md#exercise-6-golden-benchmark-evaluation-10-mins) | `npm run eval` benchmark execution | [expected-outputs.md: Ex 6](./expected-outputs.md#exercise-6-golden-benchmark-evaluation-output) | **Complete** |
| **Teaching Pack Deliverables** (Slides, Lab, Challenges, Mistakes, Map) | `DEV-013` | All (LO-01 to LO-09) | 90-minute masterclass curriculum | Full lab sheet & stretch challenges | Complete teaching pack artifacts | All files in `teaching/` directory | **Complete** |
| **Video Deliverables** (Product Demo & Teaching Sample) | `VIDEO-001`, `VIDEO-002` | All (LO-01 to LO-09) | Product demo & teaching sample video delivery | Video script walkthroughs | Recorded video scripts | [video-demo-script.md](./video-demo-script.md); [video-teaching-script.md](./video-teaching-script.md) | **Complete** |

### 7.2 Official ITI Requirements vs Internal Story Identifiers

To maintain complete audit transparency, internal project codes are classified against official ITI Technical Assessment requirements:

| Identifier | Classification | Official ITI Source Reference | Role in Repository |
|---|---|---|---|
| **D0 Healthcare** | **Official ITI Requirement** | Assigned Domain D0: Healthcare | Domain business logic, clinical protocols, drug interaction checking. |
| **T1 Bilingual AR+EN** | **Official ITI Requirement** | Mandatory Twist T1: Bilingual Arabic + English | Cross-lingual RAG, Unicode language detection, dual FTS, RTL rendering. |
| **15–25 Slides** | **Official ITI Requirement** | Postgraduate Teaching Pack Specification | `teaching/slides.md` (20 slides). |
| **90-Minute Structure** | **Official ITI Requirement** | Postgraduate Teaching Pack Specification | Section 8 of this map; Slide 2 agenda. |
| **Hands-on Lab** | **Official ITI Requirement** | Postgraduate Teaching Pack Specification | `teaching/lab-sheet.md` (Exercises 1–6). |
| **>= 3 Stretch Challenges** | **Official ITI Requirement** | Postgraduate Teaching Pack Specification | `teaching/stretch-challenges.md` (Challenges 1–3). |
| **Answer Key** | **Official ITI Requirement** | Postgraduate Teaching Pack Specification | `teaching/stretch-challenges.md` solutions; `expected-outputs.md`. |
| **5 Trainee Misconceptions** | **Official ITI Requirement** | Postgraduate Teaching Pack Specification | `teaching/common-mistakes.md` (Misconceptions 1–5). |
| **Learning Outcomes Map** | **Official ITI Requirement** | Postgraduate Teaching Pack Specification | `teaching/assessment-map.md` (this document). |
| **Video 1: Product Demo (5–8m)** | **Official ITI Requirement** | Video Deliverables Specification | `teaching/video-demo-script.md`. |
| **Video 2: Teaching Sample (~10m)** | **Official ITI Requirement** | Video Deliverables Specification | `teaching/video-teaching-script.md`. |
| `ING-001` to `ING-008` | **Internal Story ID** | Engineering Implementation Plan (Epic 01) | Sub-tasks for document upload, chunking, and embedding. |
| `RET-001` to `RET-006` | **Internal Story ID** | Engineering Implementation Plan (Epic 02) | Sub-tasks for hybrid search, RRF fusion, and refusal floor. |
| `AGT-001` to `AGT-006` | **Internal Story ID** | Engineering Implementation Plan (Epic 03) | Sub-tasks for agent schemas, supervisor state machine, and tools. |
| `HITL-001` to `HITL-006` | **Internal Story ID** | Engineering Implementation Plan (Epic 04) | Sub-tasks for approval persistence, review queue, and audit events. |
| `RT-001` to `RT-004` | **Internal Story ID** | Engineering Implementation Plan (Epic 05) | Sub-tasks for SSE streaming, progress events, and cancellation. |
| `TW-001` to `TW-006` | **Internal Story ID** | Engineering Implementation Plan (Epic 06) | Sub-tasks for bilingual adapter, language detection, and RTL UI. |
| `OBS-001` to `OBS-007` | **Internal Story ID** | Engineering Implementation Plan (Epic 07) | Sub-tasks for correlation IDs, token ledgers, traces, and eval. |
| `DEV-001` to `DEV-013` | **Internal Story ID** | Engineering Implementation Plan (Epic 08) | Sub-tasks for Clean Architecture, auth, docs, and teaching pack. |
| `VIDEO-001`, `VIDEO-002` | **Internal Story ID** | Engineering Implementation Plan (Epic 08) | Sub-tasks for video script creation. |

---

## 8. 90-Minute Teaching Flow

The masterclass is structured into a 90-minute timeline divided evenly between theoretical instruction (45 minutes) and practical hands-on laboratory application (45 minutes):

| Time | Activity | LO(s) | Teaching Mode | Evidence |
|---|---|---|---|---|
| **00:00 – 00:15 (15m)** | **Part 1: Why Naive RAG Fails in Regulated Domains & Clean Architecture**<br>- 4 fatal failure modes (table severance, lexical blindness, hallucination, unconstrained agency).<br>- Concentric hexagonal architecture and domain purity rules. | LO-01 | Interactive Lecture & Diagram Walkthrough | Slides 1–4; `scripts/lint-arch.js`. |
| **00:15 – 00:35 (20m)** | **Part 2: Hybrid Search Engineering & Reciprocal Rank Fusion**<br>- Dense cosine vector search in `pgvector` (`<=>`).<br>- Sparse lexical search in PostgreSQL FTS (`to_tsvector`, `ts_rank_cd`).<br>- Mathematical derivation of RRF ($k=60$) and the Low-Evidence Refusal Gate ($< 0.015$). | LO-02, LO-03, LO-04 | Technical Derivation & Whiteboard | Slides 5–10; SQL queries in `retrieval.service.ts`. |
| **00:35 – 00:55 (20m)** | **Part 3: Multi-Agent Supervisor State Machines & Specialist Contracts**<br>- Orchestration state machine with circuit breakers (max 5 iterations, 30s timeouts).<br>- Specialist 1 (Extractor), Specialist 2 (Auditor), Specialist 3 (Drafter).<br>- Strict Zod schema contracts and self-healing corrective prompts. | LO-05 | Architecture Deep Dive & Code Review | Slides 11–14; `orchestrator.service.ts`. |
| **00:55 – 01:10 (15m)** | **Part 4: Mandatory Twist T1 (Bilingual AR+EN) & HITL Governance**<br>- Cross-lingual embeddings, Unicode detection, dual FTS dictionaries (`simple`/`english`), RTL UI.<br>- Two-phase commit approval pattern, cryptographic tokens, immutable audit trails. | LO-06, LO-07 | Live System Walkthrough | Slides 15–16; `/reviews` UI; `twist.adapter.ts`. |
| **01:10 – 01:20 (10m)** | **Part 5: Prompt Injection Hardening & Real-Time SSE Observability**<br>- Context delimiter escaping (`&lt;/untrusted_evidence&gt;`), DAN redaction.<br>- SSE token streaming, heartbeat resilience, waterfall traces, and token ledgers. | LO-08, LO-09 | Security Analysis & Dashboard Demo | Slides 17–19; `/runs/:id` trace inspector. |
| **01:20 – 01:30 (10m)** | **Part 6: Hands-On Lab Briefing, Expected Outputs & Stretch Challenges**<br>- Overview of Lab Exercises 1–6 in `lab-sheet.md`.<br>- Explanation of expected terminal outputs and common trainee pitfalls.<br>- Assignment of optional Stretch Challenges 1–3. | All (LO-01 to LO-09) | Lab Launch & Q&A | Slide 20; `lab-sheet.md`; `expected-outputs.md`. |
| **Total: 90m** | **Complete Masterclass Curriculum** | **LO-01 to LO-09** | **Hybrid Lecture + Lab** | **Full Teaching Pack** |

---

## 9. Assessment Strategy

### 9.1 Demonstration of Understanding
Learners demonstrate competence through a combination of:
1. **Automated Verification**: Running deterministic test scripts (`npm run lint:arch`, `npm run test:corpus`, `npm run eval`, `npm run test:security`) that produce objective PASS/FAIL results.
2. **Interactive UI Verification**: Executing live clinical queries on `/copilot`, inspecting structured citations in the evidence drawer, and verifying safe refusal on out-of-corpus prompts.
3. **Operational Governance**: Intercepting and authorizing consequential medical actions in the `/reviews` approval queue using the Edit-and-Approve workflow.

### 9.2 Measurement of Practical Competence
Practical competence is measured against the verbatim outputs defined in [expected-outputs.md](./expected-outputs.md):
- **Architecture Purity**: AST check confirms 0 illegal framework imports in `src/core/domain/`.
- **Corpus Standards**: Verification of $\ge 30$ documents, $\ge 150$ pages, and 0 detected PII instances.
- **Refusal Precision**: Observation of `REFUSED: LOW EVIDENCE` with an empty citations list on ungrounded questions.
- **Evaluation Benchmark**: Golden test suite achieving 100% pass rate and sub-second latency in the teaching environment.

### 9.3 Diagnostic Remediation (Identifying Weak Areas)
The instructor diagnoses trainee difficulties using the 5 common misconceptions in [common-mistakes.md](./common-mistakes.md):
- If a trainee questions why lexical search is needed alongside vectors, direct them to Misconception 1 (exact drug codes and statutory references).
- If a trainee relies on UI-only button disabling for security, direct them to Misconception 2 (server-side approval token verification).
- If a trainee relies on prompt instructions to avoid hallucination, direct them to Misconception 3 (architectural low-evidence refusal gates).
- If a trainee proposes fixed 500-token chunks, direct them to Misconception 4 (table severance and section preservation).
- If a trainee implements an unconstrained agent loop, direct them to Misconception 5 (deterministic supervisor state machines with iteration caps).

---

## 10. Stretch / Advanced Path

The teaching pack provides 3 optional stretch challenges for advanced learners, documented in [teaching/stretch-challenges.md](./stretch-challenges.md). These exercises are explicitly optional and do not impact core lab completion:

| Stretch Challenge | Related LO | Advanced Skill Developed | Assessment Evidence |
|---|---|---|---|
| **Challenge 1: Dynamic Top-K Adaptive Retrieval** | LO-03 | Query entropy analysis and dynamic retrieval depth scaling. | Code modification in `retrieval.service.ts`; trace inspector shows 12 retrieved candidates for short queries. |
| **Challenge 2: Cryptographically Signed Approval Tokens** | LO-07 | Server-side cryptographic HMAC-SHA256 signing for zero-trust approval tokens. | Code implementation in `approval.service.ts`; invalid or tampered tokens throw authorization errors. |
| **Challenge 3: Negative Ingestion Security Filter** | LO-08 | Ingestion-time AST and regex filtering against adversarial prompt override patterns. | Code modification in `ingestion.service.ts`; test document containing `IGNORE PREVIOUS INSTRUCTIONS` is rejected. |

---

## 11. Answer Key / Instructor Evidence Mapping

To preserve academic integrity while enabling rapid instructor grading, complete solutions for the stretch challenges are documented in [teaching/stretch-challenges.md](./stretch-challenges.md) and expected terminal outputs are detailed in [teaching/expected-outputs.md](./expected-outputs.md):

| Exercise / Challenge | Expected Solution / Result | Related LO | Instructor Reference |
|---|---|---|---|
| **Lab Exercise 1** | Clean Architecture lint passes with 0 violations. | LO-01 | [expected-outputs.md: Ex 1](./expected-outputs.md#exercise-1-architecture-boundary-linter) |
| **Lab Exercise 2** | Corpus validated: 32 docs, 197 pages, clean PII. | LO-02 | [expected-outputs.md: Ex 2](./expected-outputs.md#exercise-2-corpus-validation) |
| **Lab Exercise 4** | Out-of-corpus query returns `status: REFUSED`. | LO-04 | [expected-outputs.md: Ex 4](./expected-outputs.md#exercise-4-low-evidence-refusal-response) |
| **Lab Exercise 6** | Benchmark passes 26 cases with 100% pass rate. | LO-09 | [expected-outputs.md: Ex 6](./expected-outputs.md#exercise-6-golden-benchmark-evaluation-output) |
| **Stretch Challenge 1** | Adaptive `topK = queryTerms < 4 ? 12 : 5;` logic. | LO-03 | [stretch-challenges.md: Solution 1](./stretch-challenges.md#solution--answer-key) |
| **Stretch Challenge 2** | `createHmac("sha256", secret)` token generator. | LO-07 | [stretch-challenges.md: Solution 2](./stretch-challenges.md#solution--answer-key-1) |
| **Stretch Challenge 3** | `JAILBREAK_REGEX.test(extractedContent)` filter. | LO-08 | [stretch-challenges.md: Solution 3](./stretch-challenges.md#solution--answer-key-2) |

---

## 12. Coverage Summary

| Pedagogical Area | Status | Verifiable Evidence | Notes |
|---|---|---|---|
| **Learning Outcomes** | **Complete** | Section 3 of this document; 9 defined LOs. | Accurately reflects architecture and assessment scope. |
| **Teaching Content** | **Complete** | [teaching/slides.md](./slides.md) (20 slides); [teaching/video-teaching-script.md](./video-teaching-script.md). | Covers theory, math, code, and security. |
| **Core Labs** | **Complete** | [teaching/lab-sheet.md](./lab-sheet.md) (Exercises 1–6). | Step-by-step hands-on terminal and UI tasks. |
| **Stretch Challenges** | **Complete** | [teaching/stretch-challenges.md](./stretch-challenges.md) (Challenges 1–3). | Optional advanced engineering exercises with solutions. |
| **Assessment Instruments** | **Complete** | Automated scripts, expected outputs, UI audits. | Objective, reproducible verification. |
| **ITI Traceability** | **Complete** | Section 7 matrix; verified against official ITI source. | Explicit distinction between official requirements & story IDs. |
| **Answer Key** | **Complete** | [teaching/stretch-challenges.md](./stretch-challenges.md); [teaching/expected-outputs.md](./expected-outputs.md). | Complete solutions and expected console logs. |
| **90-Minute Timing** | **Complete** | Section 8 flow; [slides.md: Slide 2](./slides.md#slide-2-90-minute-masterclass-agenda). | Balanced 45m lecture + 45m hands-on lab. |

---

## 13. Gaps and Improvements

In accordance with strict verification standards, the following areas of partial coverage or structural improvements are documented:

| Area | Status | Observed Status & Justification | Recommended Improvement |
|---|---|---|---|
| **Bilingual Twist T1 in Core Lab Sheet (LO-06)** | **Partial** | Bilingual Arabic + English concepts are taught extensively in lecture ([slides.md: Slide 15](./slides.md#slide-15-mandatory-twist-t1-bilingual-arabic--english-aren)), video scripts, and code walkthroughs, but the primary walkthrough query in [lab-sheet.md: Exercise 3](./lab-sheet.md#exercise-3-running-the-application--testing-grounded-queries-25-mins) uses an English clinical prompt. | Add an explicit optional sub-step to Lab Exercise 3 instructing trainees to submit an Arabic clinical query (e.g. *"ما هي موانع استعمال بروتوكول القلب؟"*) to verify bi-directional RTL rendering firsthand. |
| **Benchmark Test Case Count Separation (LO-09)** | **Complete (Documented)** | The student lab teaching output ([expected-outputs.md](./expected-outputs.md#exercise-6-golden-benchmark-evaluation-output)) reports 26 test cases for fast classroom execution, whereas the full production evaluation harness (`fixtures/eval-results.json`) executes 33 test cases (with 90.9% pass rate and edge-case analysis in `docs/EVALUATION.md`). | Documented as separate artifacts in Section 6.2 to avoid conflating student lab expectations with production regression data. |

---

## 14. Related Documents

- [Teaching Slides (`teaching/slides.md`)](./slides.md): 20-slide masterclass deck.
- [Hands-on Lab Sheet (`teaching/lab-sheet.md`)](./lab-sheet.md): Student laboratory worksheet.
- [Stretch Challenges & Answer Key (`teaching/stretch-challenges.md`)](./stretch-challenges.md): Advanced engineering extensions.
- [Expected Outputs (`teaching/expected-outputs.md`)](./expected-outputs.md): Verbatim terminal logs and JSON fixtures.
- [Common Mistakes Guide (`teaching/common-mistakes.md`)](./common-mistakes.md): 5 trainee misconceptions and architectural corrections.
- [Video Teaching Script (`teaching/video-teaching-script.md`)](./video-teaching-script.md): Technical script for the 10-minute masterclass video (`VIDEO-002`).
- [Video Demo Script (`teaching/video-demo-script.md`)](./video-demo-script.md): Storyboard and narration script for the product demo (`VIDEO-001`).
- [Business Requirements Document (`docs/BRD.md`)](file:///c:/Users/LOQ/domain-copilot/docs/BRD.md): Clinical requirements and domain rules.
- [System Design Document (`docs/SYSTEM-DESIGN.md`)](file:///c:/Users/LOQ/domain-copilot/docs/SYSTEM-DESIGN.md): Detailed component architecture and trade-offs.
- [Architecture Document (`docs/ARCHITECTURE.md`)](file:///c:/Users/LOQ/domain-copilot/docs/ARCHITECTURE.md): C4 structural diagrams, trust boundaries, and ITI traceability.
- [Agentic Workflow Specification (`docs/AGENTIC-WORKFLOW.md`)](file:///c:/Users/LOQ/domain-copilot/docs/AGENTIC-WORKFLOW.md): Multi-agent prompt contracts and supervisor state transitions.
- [Evaluation Documentation (`docs/EVALUATION.md`)](file:///c:/Users/LOQ/domain-copilot/docs/EVALUATION.md): Benchmark results, methodology, and empirical metrics.
- [Security Documentation (`docs/SECURITY.md`)](file:///c:/Users/LOQ/domain-copilot/docs/SECURITY.md): Threat modeling, prompt injection defenses, and RBAC specifications.
- [Project README (`README.md`)](file:///c:/Users/LOQ/domain-copilot/README.md): Quickstart setup, environment variables, and test execution guide.
