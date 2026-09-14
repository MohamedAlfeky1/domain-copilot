# Domain Copilot: Assessment-Aligned Agentic RAG Platform

Domain Copilot is an enterprise-grade Agentic Retrieval-Augmented Generation (RAG) platform built with **Next.js 14**, **Node.js runtime**, **React 18**, **Tailwind CSS**, **PostgreSQL / pgvector**, and **Docker Compose**. It incorporates Clean Architecture boundaries, a 5-stage document ingestion pipeline, dual-channel hybrid retrieval with Reciprocal Rank Fusion (RRF), a multi-agent supervisor coordinating 3 domain specialists, a Human-in-the-Loop (HITL) approval gate, real-time SSE token streaming, and an empirical evaluation harness.

---

## 5-Minute Quickstart Demo Path (Clean Machine)

### Option A: Running with Docker Compose (Recommended)
```bash
# 1. Clone repository
git clone <repo-url>
cd "Ai Rag"

# 2. Configure environment
cp .env.example .env

# 3. Boot database and application with one command
docker compose up --build
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Option B: Running Locally with Node.js
```bash
# 1. Install dependencies
npm install

# 2. Seed corpus (32 documents, 197 pages)
npm run seed:corpus

# 3. Verify corpus floor
npm run test:corpus

# 4. Start Next.js development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## Seeded Demo Accounts (Server-Side RBAC)

| Email | Password | Role | Permissions |
|:---|:---|:---|:---|
| `admin@domaincopilot.ai` | `admin123` | **ADMIN** | Full Corpus Management, Re-ingestion, System Settings |
| `approver@domaincopilot.ai` | `approver123` | **APPROVER** | HITL Review Queue, Edit & Approve, Rejections |
| `expert@domaincopilot.ai` | `expert123` | **EXPERT** | Copilot Queries, Chunk Inspector, Run Trace Views |

---

## Core Verification Commands

```bash
# 1. Clean Architecture boundary linting (DEV-001)
npm run lint:arch

# 2. Unit test pyramid with offline stubs (DEV-005)
npm run test:unit

# 3. Hybrid retrieval regression tests (RET-006)
npm run test:retrieval

# 4. Prompt injection security regression suite (OBS-005)
npm run test:security

# 5. Corpus floor validation (ING-008)
npm run test:corpus

# 6. Golden Q/A benchmark harness (25+ cases) (OBS-004)
npm run eval

# 7. Mandatory Twist evaluation slice (TW-006)
npm run eval:twist

# 8. Generate evaluation report (OBS-007)
npm run eval:report
```

---

## Variant Safety Gate ($D_n$ & $T_n$)

Per the assessment brief:
- **Domain ($D_n$)**: $(\text{last two National ID digits}) \pmod 7$
- **Twist ($T_n$)**: $(\sum \text{all digits}) \pmod 8$

The active variant is locked in `src/config/variant.config.ts`:
- Active Domain: `D0: Healthcare (Clinical Protocols & Patient Safety)`
- Active Twist: `T1: Bilingual Arabic + English (AR+EN Cross-Lingual RAG & RTL)`
- Bonus Safety Feature: Deterministic Side-Effect Risk Guard (`ITwistPort.evaluateRiskGuard`)

Placeholder strings like `"D<n>"` will cause the application to fail fast on boot.

---

## AI Model & Provider Options

- **Primary Cloud Model**: OpenAI `gpt-4o` for completions and `text-embedding-3-small` for embeddings.
- **Local / Free Fallback Path**: The application includes a deterministic mock adapter that runs all features, agent steps, and vector search offline without requiring an OpenAI API key or internet access.

---

## Repository Documentation Index

- [Business Requirements Document (BRD)](docs/BRD.md)
- [System Design & Gap Analysis](docs/SYSTEM-DESIGN.md)
- [System Architecture & C4 Diagrams](docs/ARCHITECTURE.md)
- [Security & OWASP Threat Controls](docs/SECURITY.md)
- [Empirical Evaluation Benchmark](docs/EVALUATION.md)
- [Agentic Coding Workflow Pack](docs/AGENTIC-WORKFLOW.md)
- [AI Usage Log & Verification Record](docs/AI-USAGE-LOG.md)
- [Architecture Decision Records (ADRs)](docs/adr/)
- [Postgraduate Teaching Pack](teaching/)
