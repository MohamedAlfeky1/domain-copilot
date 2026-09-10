# Security Controls & Threat Mitigation Matrix - Domain Copilot (DEV-008)

This document maps implemented security guardrails to the **OWASP Top 10 for LLM Applications** and **OWASP Top 10 Web Application Security Risks**.

---

## 1. OWASP Top 10 for LLM Applications Mapping

| Threat ID | Threat Description | Implemented Countermeasure | Verification Test |
|:---|:---|:---|:---|
| **LLM01** | **Prompt Injection** | Strict prompt boundary isolation (`<untrusted_evidence>`); closing tag sanitization; agent instructions instruct model to ignore commands in corpus. | `scripts/test-security.js` Attack 1 & 2 |
| **LLM02** | **Insecure Output Handling** | Raw output is sanitized before rendering; Markdown renderer disables dangerous HTML script execution. | Unit test output sanitizer |
| **LLM04** | **Model Denial of Service** | Hard execution cap of 5 iterations per query; client cancellation via `AbortController` stops server LLM generation immediately. | Orchestrator iteration test |
| **LLM06** | **Sensitive Information Disclosure** | Pre-ingestion synthetic data validator scrubs PII; credentials never written to trace store or application logs. | `scripts/test-corpus.js` PII scan |
| **LLM08** | **Excessive Agency** | Per-agent tool allowlists; side-effecting actions require cryptographically validated approval token from HITL gate. | `scripts/test-security.js` Attack 3 |

---

## 2. Web Application Security Controls

1. **SQL Injection Prevention**: Parameterized queries and typed query models (zero raw string concatenation).
2. **Role-Based Access Control (RBAC)**: Enforced server-side in API route handlers; object ownership verified before mutation.
3. **Upload Security**: 25MB file size boundary; MIME type and extension whitelist (`.pdf`, `.docx`, `.txt`, `.md`); SHA-256 checksum validation.
4. **Data Egress Disclosure**: When using OpenAI, only retrieved chunk text and user queries egress to `api.openai.com` over TLS 1.3. User credentials, database connection strings, and audit logs remain strictly on-premises.
