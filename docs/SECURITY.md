# Security Controls & Threat Mitigation Matrix - Domain Copilot (DEV-008)

This document details the implemented security controls, threat mitigations, and verification mechanisms mapped against the **OWASP Top 10 for Large Language Model Applications (2025)** and the **OWASP Top 10 Web Application Security Risks**.

---

## 1. OWASP Top 10 for LLM Applications Mapping

| Threat ID | Threat Category | Implemented Countermeasure | Verification Mechanism |
|:---|:---|:---|:---|
| **LLM01** | **Prompt Injection (Direct & Indirect)** | Strict prompt boundary isolation (`<untrusted_evidence>`); closing tag sanitization (`&lt;/untrusted_evidence&gt;`); user instruction redaction (`[REDACTED_SYSTEM_OVERRIDE]`); schema enforcement via Zod contracts. | `scripts/test-security.js` (SEC-001, SEC-002) |
| **LLM02** | **Insecure Output Handling** | LLM outputs parsed strictly through typed Zod schemas (`parseAgentOutput`); unverified freeform text rejected before database write or tool invocation. HTML characters escaped before UI rendering. | `scripts/test-security.js` (SEC-006) |
| **LLM03** | **Training Data Poisoning** | Synthetic & public domain corpus validation; pre-ingestion PII scanner; SHA-256 content hashing to ensure idempotent un-tampered document ingestion. | `scripts/test-corpus.js` |
| **LLM04** | **Model Denial of Service** | Circuit breaker iteration limit (max 5 rounds per workflow); 30,000ms per-step timeout; streaming client disconnection (`signal.aborted`) immediately halts server-side LLM completion. | `scripts/test-unit.js` (Test 10) |
| **LLM05** | **Supply Chain Vulnerabilities** | Minimal vetted dependencies; pinned versions in `package-lock.json`; Clean Architecture Hexagonal isolation preventing third-party SDK leaks into core domain. | `scripts/lint-arch.js` |
| **LLM06** | **Sensitive Information Disclosure** | Pre-ingestion synthetic data validator scrubs SSNs, credit cards, and private emails; API keys and secrets excluded from trace inspector and client telemetry. | `scripts/test-corpus.js` |
| **LLM07** | **Insecure Plugin Design** | Tool parameters validated against JSON Schema; side-effecting tools segregated from read-only tools; per-agent tool allowlists. | `src/core/application/agents/tool-registry.ts` |
| **LLM08** | **Excessive Agency** | Consequential operations (`execute_protocol_update`) require cryptographically generated HITL approval tokens; Mandatory Twist Risk Guard halts operations exceeding the 0.85 uncertainty floor. | `scripts/test-security.js` (SEC-003, SEC-005) |
| **LLM09** | **Overreliance** | Grounded citation requirement; structured citations containing document ID, version, section, and page; explicit low-evidence refusal gate (< 0.015 RRF score) preventing hallucinations. | `scripts/test-retrieval.js` (RET-004) |
| **LLM10** | **Model Theft** | Proprietary prompts, domain risk policies, and retrieval scoring logic isolated behind backend API layer; no raw prompt templates exposed to browser clients. | `src/middleware.ts` |

---

## 2. OWASP Top 10 Web Application Security Controls

| Threat Category | Implemented Mitigation | Verification Mechanism |
|:---|:---|:---|
| **A01: Broken Access Control** | Server-side RBAC guard (`src/infrastructure/auth/auth-guard.ts`) enforcing role hierarchy (`ADMIN`, `APPROVER`, `EXPERT`, `VIEWER`). Approval actions and re-ingestion strictly barred to non-approvers (HTTP 403). | `scripts/test-integration.js` (INT-002, INT-003) |
| **A02: Cryptographic Failures** | SHA-256 content hashing for document versioning and tool argument deduplication; TLS 1.3 encryption for external AI provider egress; HTTP-only cookies for session tokens. | `scripts/test-unit.js` (Test 6) |
| **A03: Injection (SQL & Command)** | PostgreSQL queries executed via parameterized statements in PGlite (`$1`, `$2` placeholders); zero string concatenation in dynamic SQL; zero shell execution paths. | `scripts/test-retrieval.js` |
| **A04: Insecure Design** | Clean Architecture with Domain purity; deterministic risk floors; two-phase approval protocol with immutable append-only audit event logging. | `scripts/lint-arch.js` |
| **A05: Security Misconfiguration** | Next.js security middleware (`src/middleware.ts`) enforcing strict CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `HSTS`. | `src/middleware.ts` |
| **A06: Vulnerable Components** | Regular npm audit; explicit types for Node and React; zero unvetted runtime dependencies. | `package.json` |
| **A07: Identification & Auth Failures** | Token verification with signature decoding and expiration checks; guest sessions fall back to read-only roles without privilege escalation. | `src/infrastructure/auth/auth-guard.ts` |
| **A08: Software & Data Integrity** | Input validation using Zod for all HTTP request bodies; version-aware document storage rejecting stale document versions from active search. | `src/core/application/agents/agent-contracts.ts` |
| **A09: Security Logging & Monitoring** | Every request assigned a unique `x-correlation-id` (OBS-001) propagated through middleware, DB queries, agent steps, and usage ledger; token spend tracked in real time. | `scripts/test-integration.js` (INT-005) |
| **A10: Server-Side Request Forgery** | Ingestion pipeline restricts file retrieval strictly to local disk staging; zero dynamic external URL fetching or unvetted web scraping. | `src/infrastructure/storage/local-staging.adapter.ts` |

---

## 3. Correlation ID & Audit Trail Architecture (OBS-001)
- **Inbound Tracking**: `middleware.ts` inspects inbound `x-correlation-id` headers. If absent, a new UUID is generated.
- **Trace Propagation**: Correlation ID forwarded across Next.js API route handlers, `MultiAgentOrchestrator`, `HybridRetrievalService`, and `DatabaseAdapter`.
- **Database Persistence**: Saved into `runs`, `run_steps`, `tool_calls`, `approval_requests`, `approval_events`, and `usage_ledger`.
- **Response Header**: Egress responses include `x-correlation-id` for end-to-end client observability.
