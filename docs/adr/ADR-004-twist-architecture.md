# ADR-004: Mandatory Twist (T1: Bilingual Arabic + English) Port-Adapter Architecture

## Status
Accepted

## Context
The assessment mandates implementing a specific variant twist (**T1: Bilingual AR+EN**) derived from the candidate's National ID calculation $((\sum \text{digits}) \pmod 8 = 1)$ for **Domain D0: Healthcare** $((\text{last 2 digits}) \pmod 7 = 0)$. The platform must support cross-lingual ingestion, retrieval, and presentation:
1. Ingesting both Arabic and English clinical documents.
2. Cross-lingual retrieval: English queries retrieving Arabic evidence and Arabic queries retrieving English evidence.
3. RTL layout rendering for Arabic text in UI components.
4. Dedicated evaluation slices measuring bilingual retrieval precision and recall.

Additionally, the previously engineered Deterministic Side-Effect Risk Guard is retained as an internal safety layer protecting high-consequence operations.

## Decision
1. **Clean Architecture Port (`ITwistPort`)**: Define language detection, cross-lingual configuration, FTS configuration routing, and RTL rendering methods on `ITwistPort` in `src/core/application/ports/twist.port.ts`.
2. **Infrastructure Adapter (`BilingualTwistAdapter`)**: Implement the port in `src/infrastructure/twist/twist.adapter.ts`.
   - Use Unicode block analysis (`\u0600-\u06FF`) for zero-dependency, ultra-fast language detection.
   - Route PostgreSQL FTS to `simple` dictionary for Arabic text and `english` dictionary for English text.
   - Leverage `text-embedding-3-small` shared multilingual vector space for native cross-lingual dense matching.
3. **Dynamic Bi-directional UI (`dir="auto"` & RTL CSS)**: Support fluid bi-directional text rendering in chat bubbles, citation badges, and source evidence drawers.
4. **Preserved Risk Guard**: Keep `evaluateRiskGuard` on the port/adapter as an internal safety mechanism guarding consequential protocol modifications before HITL approval.

## Alternatives Considered & Rejected
- **Machine Translation Pre-processor (e.g. Google Translate API on every query)**: Rejected due to network latency, translation inaccuracies for clinical nomenclature, API cost, and external dependency risks. Shared multilingual embeddings natively solve cross-lingual dense retrieval without runtime translation overhead.
- **Separate Monolingual Vector Stores**: Rejected as it prevents fused multi-lingual ranking and requires complex synchronization.

## Consequences
- **Positive**: Clean separation of bilingual concerns behind `ITwistPort`; zero external translation API latency; seamless cross-lingual retrieval via PostgreSQL and pgvector.
- **Negative**: Requires handling both `simple` and `english` FTS dictionaries in hybrid search fusion.
