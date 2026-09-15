---
marp: true
theme: default
paginate: true
header: "Domain Copilot: Enterprise Agentic RAG Masterclass"
footer: "Postgraduate Engineering Lab · 90-Minute Interactive Session"
---

# Masterclass: Architecting Enterprise Agentic RAG
### Hybrid Dense-Keyword Retrieval, Multi-Agent Supervisors & Human-in-the-Loop Governance
**Instructor:** Antigravity AI Engineering
**Duration:** 90 Minutes (Lecture + Hands-on Lab)

---

## Session Roadmap (90 Minutes)
1. **Part 1 (20m):** Core Limitations of Naive RAG & Why Agentic Architectures Matter
2. **Part 2 (20m):** Hybrid Search Engineering (Dense Cosine vs Full-Text Keyword with RRF)
3. **Part 3 (20m):** Multi-Agent Orchestration & Deterministic State Machines
4. **Part 4 (20m):** Human-in-the-Loop Governance & Prompt Injection Defenses
5. **Part 5 (10m):** Hands-On Lab Walkthrough & Stretch Challenges

---

## Slide 2: Why Naive RAG Fails in Regulated Domains
- **Chunk Fragmentation:** Arbitrary 500-character windows break dosage tables and clause boundaries.
- **Semantic Mismatch:** Vector embeddings struggle with specific alphanumeric codes (e.g. "Section 14.2(b)").
- **Hallucination Under Uncertainty:** Standard LLMs will guess answers when evidence is missing.
- **Unbounded Tool Execution:** Giving models direct API write access leads to unauthorized side-effects.

---

## Slide 3: Clean & Hexagonal Architecture in AI Systems
- **Domain Purity:** Entities (Document, Chunk, Run) have zero imports of OpenAI, LangChain, or Prisma.
- **Ports & Adapters:**
  - `IAIProviderPort` -> OpenAI (gpt-4o) Adapter, Local Ollama Adapter, Mock CI Adapter.
  - `IVectorStorePort` -> pgvector Adapter, Memory Adapter.
- **Testability:** Complete system testable offline without burning cloud API credits.

---

## Slide 4: Structure-Aware Document Ingestion
- **Extract:** Raw text extraction preserving document structure.
- **Clean:** Deterministic boilerplate removal without altering page offsets.
- **Chunk:** Section and paragraph boundary preservation; stable hashes:
  $$\text{chunk\_id} = \text{MD5}(\text{doc\_id} + \text{index} + \text{text})$$
- **Embed & Index:** 1536-dimensional vectors indexed into PostgreSQL `pgvector`.

---

## Slide 5: Hybrid Retrieval & Reciprocal Rank Fusion (RRF)
- Parallel execution:
  1. Dense Cosine Distance ($A \cdot B / \|A\| \|B\|$).
  2. PostgreSQL Full-Text Keyword Search (`ts_rank`).
- Fused Ranking via RRF ($k = 60$):
  $$RRF(d) = \sum_{m \in \{\text{dense}, \text{keyword}\}} \frac{w_m}{60 + \text{rank}_m(d)}$$
- Dual-channel hits receive elevated priority.

---

## Slide 6: The Low-Evidence Refusal Gate
- When top candidate fused score $< 0.015$ or chunk count $< 1$:
  - Platform triggers explicit typed refusal (`LOW_EVIDENCE_REFUSAL`).
  - Blocks answer drafting prompt.
  - Returns honest feedback without fabricated claims.

---

## Slide 7: Supervisor Multi-Agent Orchestrator
- **Supervisor State Machine:**
  - Iteration limit: 5 rounds max.
  - Per-step timeout: 30 seconds.
- **Three Assigned Specialists:**
  1. **Specialist 1 (Extractor):** Extracts verified factual statements with chunk IDs.
  2. **Specialist 2 (Auditor):** Checks domain compliance and contraindications.
  3. **Specialist 3 (Drafter):** Synthesizes final response using gpt-4o with inline citations.

---

## Slide 8: Human-in-the-Loop (HITL) Governance
- Any side-effecting operation (e.g. `execute_protocol_update`) is halted before execution.
- Reviewer Queue UI (`/reviews`):
  - **Approve:** Executes action with signed token.
  - **Edit & Approve:** Reviewer modifies payload; revalidates schema.
  - **Reject:** Requires non-empty mandatory reason.
- Immutable append-only audit trail in `approval_events`.

---

## Slide 9: Prompt Injection & LLM Security Defenses
- **Boundary Isolation:** User inputs and retrieved text wrapped in `<untrusted_evidence>` tags.
- **Closing Tag Sanitization:** Prevents attackers from breaking out of delimiter boundaries.
- **Privilege Separation:** Read-only specialist agents have zero permissions to invoke write tools.

---

## Slide 10: Hands-on Lab Overview & Objectives
- Launch Domain Copilot using `npm run dev` or `docker compose up`.
- Exercise the 5-Minute Demo Path:
  1. Ingest clinical guidelines.
  2. Test grounded queries and observe real-time SSE progress.
  3. Trigger an intentional out-of-corpus refusal.
  4. Authorize a consequential action through the HITL gate.
- Complete the 3 Stretch Challenges.
