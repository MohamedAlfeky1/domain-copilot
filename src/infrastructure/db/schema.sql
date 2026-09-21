-- ==============================================================================
-- DOMAIN COPILOT: PRODUCTION POSTGRESQL + PGVECTOR SCHEMA
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Users table (Server-side Auth & RBAC)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'EXPERT', -- 'ADMIN', 'APPROVER', 'EXPERT', 'VIEWER'
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Conversations table (Persistent chat history)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_owner ON conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);


-- 3. Documents table (Corpus identity)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    current_version_id UUID,
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED', -- QUEUED, PROCESSING, INDEXED, FAILED
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Document Versions table (Version-aware retrieval)
CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    content_hash VARCHAR(64) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    pages INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_doc_version UNIQUE (document_id, version)
);

-- 5. Chunks table (Citation source unit)
CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    section VARCHAR(255),
    page INTEGER,
    clause VARCHAR(255),
    text TEXT NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Full text search index for PostgreSQL keyword search
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON chunks USING gin(to_tsvector('english', text));
CREATE INDEX IF NOT EXISTS idx_chunks_doc_version ON chunks(document_version_id);

-- 6. Chunk Embeddings table (pgvector index)
CREATE TABLE IF NOT EXISTS chunk_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    model VARCHAR(100) NOT NULL,
    dimension INTEGER NOT NULL,
    vector vector(1536) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_chunk_model UNIQUE (chunk_id, model)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON chunk_embeddings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_vector_cosine ON chunk_embeddings USING hnsw (vector vector_cosine_ops);

-- 7. Ingestion Jobs table (Pipeline state)
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL, -- EXTRACT, CLEAN, CHUNK, EMBED, INDEX
    status VARCHAR(50) NOT NULL, -- QUEUED, RUNNING, COMPLETED, FAILED
    progress_pct INTEGER NOT NULL DEFAULT 0,
    error_code VARCHAR(100),
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- 8. Runs table (Inspectable execution)
CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255),
    correlation_id VARCHAR(100) UNIQUE NOT NULL,
    query TEXT NOT NULL,
    status VARCHAR(50) NOT NULL, -- STARTED, STREAMING, APPROVAL_PENDING, COMPLETED, REFUSED, FAILED, CANCELLED
    refusal_reason TEXT,
    final_output TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id);

-- 8b. Messages table (Persistent conversation messages)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant'
    content TEXT NOT NULL,
    citations JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_run ON messages(run_id);

-- 9. Run Steps table (Trace timeline)

CREATE TABLE IF NOT EXISTS run_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    step_type VARCHAR(50) NOT NULL, -- RETRIEVAL, AGENT_EXECUTION, TOOL_CALL, APPROVAL_GATE
    agent VARCHAR(100),
    status VARCHAR(50) NOT NULL, -- RUNNING, COMPLETED, FAILED, SKIPPED
    input_payload JSONB,
    output_payload JSONB,
    latency_ms INTEGER,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ
);

-- 10. Tool Calls table (Safe tool audit)
CREATE TABLE IF NOT EXISTS tool_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_step_id UUID NOT NULL REFERENCES run_steps(id) ON DELETE CASCADE,
    tool_name VARCHAR(100) NOT NULL,
    args_payload JSONB NOT NULL,
    args_hash VARCHAR(64) NOT NULL,
    is_side_effecting BOOLEAN NOT NULL DEFAULT FALSE,
    approval_id UUID,
    outcome JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, EXECUTED, BLOCKED, FAILED
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. Approvals table (HITL gate)
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    tool_call_id UUID REFERENCES tool_calls(id),
    proposed_action VARCHAR(255) NOT NULL,
    risk_level VARCHAR(50) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
    requester_agent VARCHAR(100) NOT NULL,
    reviewer_id UUID REFERENCES users(id),
    original_payload JSONB NOT NULL,
    original_hash VARCHAR(64) NOT NULL,
    approved_payload JSONB,
    approved_hash VARCHAR(64),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, EDIT_APPROVED, REJECTED
    decision_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMPTZ
);

-- 12. Approval Events table (Audit timeline)
CREATE TABLE IF NOT EXISTS approval_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL, -- CREATED, APPROVED, EDITED_AND_APPROVED, REJECTED
    previous_state VARCHAR(50),
    new_state VARCHAR(50) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    reason TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. Usage Ledger table (Token & Cost accounting)
CREATE TABLE IF NOT EXISTS usage_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    correlation_id VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    call_type VARCHAR(50) NOT NULL, -- COMPLETION, EMBEDDING, STREAM
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    unit_price_input NUMERIC(12, 8) NOT NULL DEFAULT 0,
    unit_price_output NUMERIC(12, 8) NOT NULL DEFAULT 0,
    cost NUMERIC(10, 6) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 14. Evaluation Cases table (Golden benchmark set)
CREATE TABLE IF NOT EXISTS evaluation_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    expected_answer TEXT NOT NULL,
    expected_chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
    category VARCHAR(100) NOT NULL, -- GROUNDED, ADVERSARIAL, OUT_OF_CORPUS, INJECTION, TWIST
    is_adversarial BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. Evaluation Results table (Evaluation metrics)
CREATE TABLE IF NOT EXISTS evaluation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES evaluation_cases(id) ON DELETE CASCADE,
    run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
    retrieval_hit BOOLEAN NOT NULL,
    groundedness_score NUMERIC(5, 4) NOT NULL,
    refusal_correct BOOLEAN NOT NULL,
    pass BOOLEAN NOT NULL,
    latency_ms INTEGER NOT NULL,
    total_cost NUMERIC(10, 6) NOT NULL,
    notes TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
