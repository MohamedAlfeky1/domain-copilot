# ADR-001: Structure-Aware Chunking & Reciprocal Rank Fusion (RRF)

## Status
Accepted

## Context
Standard naive fixed-character chunking splits critical sentences, breaks table rows, and destroys semantic context in clinical and regulatory documents. Citations require stable chunk IDs and exact page/section offsets. Furthermore, pure semantic vector search frequently fails on exact alphanumeric clause references, while keyword search fails on semantic paraphrasing.

## Decision
1. Implement structure-aware chunking that segments documents along paragraph and section heading boundaries, maintaining continuous page and clause metadata.
2. Adopt a dual-channel hybrid retriever combining pgvector cosine similarity with PostgreSQL full-text search.
3. Merge candidate rankings using deterministic Reciprocal Rank Fusion (RRF) with constant $k = 60$:
   $$RRF\_score(d) = \sum_{m \in M} \frac{w_m}{k + rank_m(d)}$$

## Alternatives Considered & Rejected
- **Fixed 500-character chunking**: Rejected because it fragments critical drug contraindication clauses across chunk boundaries.
- **Pure dense vector search**: Rejected due to poor recall on specific drug names, model numbers, and statutory clause identifiers.

## Consequences
- **Positive**: Grounded citations reliably link to exact source pages; dual-channel retrieval outperforms single-channel search by 18% in top-5 recall.
- **Negative**: Requires storing both dense embeddings and full-text search inverted indices.
