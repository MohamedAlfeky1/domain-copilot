# ADR-003: Relational Vector Storage via PostgreSQL + pgvector

## Status
Accepted

## Context
Operating separate databases for relational metadata (users, sessions, documents, audit logs) and vector embeddings (standalone vector database) introduces distributed transaction overhead, dual-write synchronization failure modes, and complex backup pipelines.

## Decision
1. Consolidate relational persistence and vector indexing into PostgreSQL 16 using the `pgvector` extension.
2. Store chunk embeddings in the `chunk_embeddings` table with cosine distance index (`vector_cosine_ops`).
3. Maintain foreign key integrity linking vectors directly to document versions and chunks.

## Alternatives Considered & Rejected
- **Standalone Pinecone / Qdrant**: Rejected for the baseline MVP to eliminate multi-service network partitioning risks and keep deployment unified under single Docker Compose.
- **Pure In-Memory Vector Library**: Rejected for production due to inability to persist across server restarts.

## Consequences
- **Positive**: Atomic ACID transactions across documents, chunks, and embeddings; single backup and migration pipeline.
- **Negative**: Requires pgvector extension compiled in PostgreSQL container.
