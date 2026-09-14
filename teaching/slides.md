---
marp: true
theme: default
paginate: true
header: "Domain Copilot: Enterprise Agentic RAG Masterclass"
footer: "Postgraduate Engineering Lab · 90-Minute Interactive Masterclass"
---

# Masterclass: Architecting Enterprise Agentic RAG
### Hybrid Dense-Keyword Retrieval, Multi-Agent Supervisors & Human-in-the-Loop Governance
**Course:** Advanced Agentic Systems & Clean Architecture  
**Instructor:** Antigravity AI Engineering  
**Duration:** 90 Minutes (Lecture + Hands-on Lab)  
**Assigned Domain:** D1: Clinical Protocol & Drug Safety | **Twist:** T1: Deterministic Risk Guard  

---

## Slide 2: 90-Minute Masterclass Agenda
1. **Part 1 (15m):** Why Naive RAG Fails in Regulated Environments & Clean Architecture
2. **Part 2 (20m):** Hybrid Search Engineering (Dense Cosine vs PostgreSQL FTS + RRF)
3. **Part 3 (20m):** Multi-Agent Orchestration & Deterministic Supervisor State Machines
4. **Part 4 (15m):** Human-in-the-Loop (HITL) Governance & Mandatory Twist Risk Guard
5. **Part 5 (10m):** Prompt Injection Hardening & Real-Time SSE Streaming
6. **Part 6 (10m):** Hands-On Lab Walkthrough, Expected Outputs & Stretch Challenges

---

## Slide 3: The 4 Fatal Failure Modes of Naive RAG
- **1. Arbitrary Chunk Fragmentation:**
  - Blind 500-token windows split dosage tables across chunks, decoupling contraindications from target drugs.
- **2. The Lexical-Semantic Mismatch:**
  - Dense embeddings struggle with precise alphanumeric protocol numbers (e.g. `Section 2.4(b)`).
- **3. Hallucination Under Uncertainty:**
  - Standard LLMs fabricate plausible advice when evidence is absent instead of refusing.
- **4. Excessive Agency & Unbounded Side-Effects:**
  - Giving models autonomous write access without a human gate can cause catastrophic actions.

---

## Slide 4: Clean Architecture & Hexagonal Purity
- **Domain Layer (Core):**
  - Zero dependencies on external frameworks (no OpenAI SDK, Next.js, or ORMs).
  - Purity enforced automatically via `scripts/lint-arch.js`.
- **Application Layer (Use Cases):**
  - `MultiAgentOrchestrator`, `HybridRetrievalService`, `IngestionService`, `ApprovalService`.
  - Driven entirely through abstract ports (`IAIProviderPort`, `IVectorStorePort`, `IDatabasePort`, `ITwistPort`).
- **Infrastructure Layer (Adapters):**
  - Pluggable adapters: PGlite / PostgreSQL, pgvector, OpenAI (gpt-4o) with deterministic test doubles.

---

## Slide 5: Structure-Aware Document Ingestion Pipeline
- **Stage 1 (Extract):** Text extracted preserving layout structure, page numbers, and headings.
- **Stage 2 (Clean):** Recurring boilerplate and headers/footers removed while preserving page offsets.
- **Stage 3 (Chunk):** Preserves section and paragraph boundaries. Stable deterministic IDs:
  $$\text{chunk\_id} = \text{SHA256}(\text{version\_id} + \text{index} + \text{section})$$
- **Stage 4 (Hash):** SHA-256 payload checksum enforces strict ingestion idempotency.
- **Stage 5 (Embed & Store):** Vector embeddings stored alongside metadata in PostgreSQL `pgvector`.

---

## Slide 6: Dense Vector Cosine Similarity Search (`pgvector`)
- **Mathematical Formulation:**
  $$\text{Cosine Similarity}(q, v) = 1 - (q \mathbin{\Leftrightarrow} v) = \frac{q \cdot v}{\|q\| \|v\|}$$
- **Real PostgreSQL Implementation (`pgvector`):**
  ```sql
  SELECT c.id, c.text, (1 - (ce.vector <=> $1::vector)) AS similarity
  FROM chunks c
  JOIN chunk_embeddings ce ON c.id = ce.chunk_id
  JOIN document_versions dv ON c.document_version_id = dv.id
  WHERE dv.is_active = TRUE
  ORDER BY ce.vector <=> $1::vector ASC LIMIT 10;
  ```
- Fast vector indexing using HNSW / IVFFlat distance graphs.

---

## Slide 7: Lexical Full-Text Keyword Search (PostgreSQL FTS)
- **Why Vectors Alone Are Not Enough:**
  - Medical codes, drug trade names, and exact legal statutory clauses require exact lexical indexing.
- **PostgreSQL Native FTS Engine:**
  - `to_tsvector('english', c.text)` parses and stems content words.
  - `plainto_tsquery('english', $1)` parses user queries.
  - `ts_rank_cd(...)` computes cover density ranking.
  ```sql
  SELECT c.id, c.text, ts_rank_cd(to_tsvector('english', c.text), plainto_tsquery('english', $1)) AS rank_score
  FROM chunks c WHERE to_tsvector('english', c.text) @@ plainto_tsquery('english', $1)
  ORDER BY rank_score DESC LIMIT 10;
  ```

---

## Slide 8: Reciprocal Rank Fusion (RRF $k=60$) Deep-Dive
- **The Ranking Challenge:** Cosine distance (0.0 to 1.0) and FTS rank scores (0.0 to 10.0+) cannot be averaged directly due to score distribution skew.
- **Reciprocal Rank Fusion Solution:** Combines candidate ranks rather than raw uncalibrated scores:
  $$RRF(d) = \sum_{m \in \{\text{dense}, \text{keyword}\}} \frac{1}{60 + \text{rank}_m(d)}$$
- **Key Properties:**
  - Outliers in one channel cannot dominate the fused score.
  - Candidates returned by **both** channels receive a substantial mathematical boost.

---

## Slide 9: The Low-Evidence Refusal Gate (< 0.015 Floor)
- **Zero Hallucination Principle:**
  - If maximum candidate fused RRF score $< 0.015$ or chunk count $= 0$:
  - The orchestrator triggers an intentional, typed refusal (`LOW_EVIDENCE_REFUSAL`).
- **Deterministic Behavior:**
  - Prevents hallucinated medical advice on out-of-corpus questions (e.g. "Stock valuation of Alpha Centauri").
  - Returns empty citations list and explanatory refusal reason.
  - Verified by `npm run test:retrieval` (RET-004) and Golden Q/A Benchmark (OBS-004).

---

## Slide 10: Metadata Scope Filtering & Active Version Guards
- **The Stale Evidence Hazard:**
  - When clinical protocols update from Version 1 (outdated) to Version 2 (revised), old chunks must never leak into search.
- **Automatic Active Version Guard:**
  - All default hybrid queries join `document_versions dv WHERE dv.is_active = TRUE`.
  - Inactive versions remain preserved for historical audit trails without contaminating live copilot responses.
- **Scope Filtering:** Query isolation by document ID, version, section, or page range with 400 Bad Request on incompatible filters.

---

## Slide 11: Multi-Agent Supervisor State Machine Architecture
- **Supervisor Workflow State Machine:**
  - Bound by `MAX_ITERATIONS = 5` circuit breaker.
  - Per-step timeout of 30,000ms.
- **Lifecycle States:**
  - `RUNNING`: Specialists executing in sequential or parallel turns.
  - `APPROVAL_PENDING`: Workflow paused awaiting human review.
  - `RESUMED`: Approver authorized action with signed token.
  - `COMPLETED`: Grounded synthesis generated with verified citations.
  - `REFUSED`: Low evidence or safety violation halted generation.

---

## Slide 12: Specialist 1: Clinical Evidence Extractor
- **Role:** Extracts grounded factual claims and constraints directly from retrieved evidence.
- **Strict Zod Contract (`ExtractorOutputSchema`):**
  ```typescript
  export const ExtractorOutputSchema = z.object({
    extractedFacts: z.array(z.object({
      statement: z.string(),
      chunkId: z.string(),
      confidence: z.number().min(0).max(1),
    })),
    relevantSections: z.array(z.string()),
    dataCompleteness: z.enum(["HIGH", "MODERATE", "INSUFFICIENT"]),
  });
  ```
- Prompt instructs model to only extract statements present in `<untrusted_evidence>`.

---

## Slide 13: Specialist 2: Contraindication & Safety Auditor
- **Role:** Enforces Domain Risk Policy and audits extracted facts against clinical contraindications.
- **Strict Zod Contract (`AuditorOutputSchema`):**
  ```typescript
  export const AuditorOutputSchema = z.object({
    verifiedFacts: z.array(z.string()),
    riskFlags: z.array(z.object({
      riskType: z.string(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      detail: z.string(),
    })),
    domainComplianceApproved: z.boolean(),
    requiresHumanReview: z.boolean(),
    proposedAction: z.string().optional(),
  });
  ```
- Flags critical drug interactions and routes to human review.

---

## Slide 14: Specialist 3: Grounded Synthesis Drafter
- **Role:** Synthesizes verified evidence into an authoritative answer with inline citations.
- **Groundedness Verification:**
  - Every claim links directly to a cited chunk: `[Doc: Cardiovascular, p. 2, Section 2.4]`.
  - Proposes downstream consequential actions only if warranted.
- **Streaming Response:**
  - Output streamed token-by-token over Server-Sent Events (SSE) while maintaining schema integrity.

---

## Slide 15: Mandatory Twist (T1): Deterministic Risk Guard
- **Assigned Twist:** Deterministic Side-Effect Risk Guard behind `ITwistPort`.
- **Ceiling Enforcement (0.85):**
  - Base risk: 0.10.
  - Consequential operation (`update`, `execute`, `delete`): $+0.30$.
  - Low evidence confidence ($< 0.35$): $+0.45$.
  - Zero evidence available: $+0.60$.
- **Result:**
  $$\text{Computed Risk Index} = 0.10 + 0.30 + 0.45 = 0.85 \ge 0.85 \implies \mathbf{BLOCKED!}$$
- Halts execution and forces human reviewer escalation before committing mutations.

---

## Slide 16: Human-in-the-Loop (HITL) Governance & Tokens
- **Two-Phase Commit Pattern:**
  1. Agent proposes consequential action -> Orchestrator pauses workflow -> Creates pending approval record in database (`status: PENDING`).
  2. Reviewer inspects action payload in Reviewer Queue (`/reviews`).
- **Cryptographic Approval Tokens:**
  - Approval generates unique token: `appr-token-<uuid>`.
  - Tool execution verifies valid token before executing mutation.
- **Immutable Audit Trail:**
  - Every action recorded in `approval_events` with timestamp and reviewer ID.

---

## Slide 17: Prompt Injection Defenses & Boundary Isolation
- **Direct Jailbreaks (DAN, System Overrides):**
  - Sanitization function `sanitizePromptBoundary()` redacts `SYSTEM OVERRIDE` markers.
- **Indirect Document Injection (Closing Delimiter Escape):**
  - Malicious text containing `</untrusted_evidence>` is escaped to `&lt;/untrusted_evidence&gt;`.
  - Prevents attacker payloads in corpus from breaking out of prompt context fences.
- **Privilege Separation:**
  - Extractor and Auditor agents have zero write permissions; only Supervisor can invoke side-effect tools.

---

## Slide 18: Real-Time SSE Streaming with Heartbeat Resilience
- **Server-Sent Events (SSE) Protocol:**
  - Stream endpoint: `GET /api/runs/:id/stream`.
  - Typed progress events: `step_start`, `step_complete`, `token`, `citation`, `twist_evaluation`.
- **Heartbeat & Disconnect Resilience (RT-002 / RT-004):**
  - Ping comment sent every 15 seconds: `: ping <timestamp>`.
  - Client disconnect via `AbortController` immediately aborts server generation via `signal.aborted`.
  - Eliminates orphan GPU/token burn.

---

## Slide 19: Full-Stack Observability & Trace Inspector
- **Correlation ID Propagation (OBS-001):**
  - `middleware.ts` attaches `x-correlation-id` to every request, SQL query, agent step, and LLM call.
- **Per-Call Token & Cost Ledger (OBS-002):**
  - Records exact prompt tokens, completion tokens, and computed USD cost ($2.50/M in, $10.00/M out for gpt-4o).
- **Trace Inspector UI (`/runs/:runId`):**
  - Nested waterfall timeline showing retrieval latency, specialist execution turns, and tool telemetry.
  - Secret sanitization redacts API keys and internal environment variables.

---

## Slide 20: Hands-On Student Lab & 3 Stretch Challenges
- **Core Lab Objective:** Ingest 32 clinical documents, execute hybrid search, observe refusal gate, and authorize an action through the HITL approval queue.
- **Stretch Challenge 1 (Retrieval):**
  - Adjust RRF smoothing parameter $k$ from 60 to 20; measure impact on Top-1 recall.
- **Stretch Challenge 2 (Governance):**
  - Modify Twist Risk Guard threshold to 0.75; verify which marginal clinical actions trip the guardrail.
- **Stretch Challenge 3 (Security):**
  - Author a custom indirect prompt injection payload in a markdown file; verify that boundary escaping halts injection.
