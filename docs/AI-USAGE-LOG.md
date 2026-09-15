# AI Usage Log & Human Verification Record (DEV-011)

This document provides a transparent, auditable record of AI-assisted engineering throughout the development of Domain Copilot.

| Entry ID | Date | Delegated Engineering Task | Changes Applied | Verification Method | Model Mistake / Correction |
|:---|:---|:---|:---|:---|:---|
| **LOG-01** | 2026-09-10 | Project scaffolding and architecture boundaries | Hexagonal architecture folders created; domain separated from infrastructure | `npm run lint:arch` | AI initially attempted to import `pg` inside `src/core/domain/types.ts`. Human corrected: separated repository ports from domain entities. |
| **LOG-02** | 2026-09-10 | Corpus generation and validation script | Created 32 domain documents with 197 pages in `scripts/corpus-seeder.js` | `node scripts/test-corpus.js` | Synthetic text generator used insufficient characters per page. Human adjusted target to 2,500 chars/page to comfortably exceed the 150-page floor. |
| **LOG-03** | 2026-09-10 | Reciprocal Rank Fusion (RRF) math | Implemented RRF fusion in `HybridRetrievalService` | `node scripts/test-retrieval.js` | Initial formula had division by zero if rank was 0. Human updated rank indexing to 1-based (`rank + 1`) and constant $k=60$. |
| **LOG-04** | 2026-09-10 | Human-in-the-loop approval state machine | Created approval requests, hash verification, and audit event logger | `node scripts/test-unit.js` | AI omitted mandatory rejection reason in initial schema. Human added check: empty rejection reasons throw `ValidationError`. |
| **LOG-05** | 2026-09-10 | Golden Q/A benchmark harness | Created 26 test cases with adversarial injections | `node scripts/eval-runner.js` | AI attempted to make live external API calls during offline test runs. Human configured mock deterministic fallback for reliable CI execution. |
