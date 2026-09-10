# Business Requirements Document (BRD) - Domain Copilot

## 1. Project Vision & Objectives
Domain Copilot is an assessment-aligned Agentic Retrieval-Augmented Generation (RAG) platform designed to deliver verified, citation-grounded answers in mission-critical domains (Clinical, Financial, Legal). The platform provides strict governance through human-in-the-loop (HITL) approval gates, dual-channel hybrid retrieval, and full token/cost accounting.

## 2. Personas & Stakeholders
1. **Clinical / Domain Expert (Viewer/Operator)**: Ingests regulatory guidelines, queries the copilot, and verifies structured citations in the source drawer.
2. **Medical Director / Authorized Reviewer (Approver)**: Reviews consequential proposed actions in the prioritized HITL queue, edits payloads, and grants or rejects approvals with mandatory reasons.
3. **Compliance Officer / System Auditor**: Inspects end-to-end execution waterfall timelines, correlation ID propagation, token spend ledgers, and immutable approval audit trails.
4. **Machine Learning / Platform Maintainer**: Evaluates golden Q/A benchmarks, monitors retrieval recall, and tracks model drift.

## 3. Core Requirements & Traceability Matrix

| Req ID | Epic | Description | Priority | Architectural Layer |
|:---|:---|:---|:---|:---|
| **REQ-01** | Ingestion | Support PDF, DOCX, TXT upload with MIME/checksum validation (ING-001) | P0 | Interface + Backend Core |
| **REQ-02** | Ingestion | Structure-aware chunking preserving section and page offsets (ING-003) | P0 | AI/Agent Engine |
| **REQ-03** | Retrieval | Hybrid dense pgvector + keyword search with RRF fusion (RET-001) | P0 | AI/Agent Engine + DB |
| **REQ-04** | Retrieval | Low-evidence refusal threshold gate without hallucination (RET-004) | P0 | AI/Agent Engine |
| **REQ-05** | Agents | Supervisor state machine with 3 assigned domain specialists (AGT-002) | P0 | AI/Agent Engine |
| **REQ-06** | HITL | Human approval gate for side-effecting operations (HITL-001 to HITL-006) | P0 | Frontend + Backend Core |
| **REQ-07** | Streaming | Real-time SSE token stream with live progress event rail (RT-001/002) | P0 | Backend Core + Frontend |
| **REQ-08** | Security | Prompt injection defense & untrusted evidence boundary (DEV-008) | P0 | Security |
| **REQ-09** | Observability| Correlation ID, token ledger & trace inspector (OBS-001 to OBS-003) | P0 | Observability |
| **REQ-10** | Evaluation | Golden Q/A benchmark (>=25 pairs, >=5 adversarial) (OBS-004) | P0 | Evaluation |

## 4. Out-of-Scope (Deferred Capabilities)
- Multi-region geographic clustering.
- Real-time voice synthesis and telephony connectors.
- Automated third-party ERP ledger reconciliation beyond API webhook tokens.
