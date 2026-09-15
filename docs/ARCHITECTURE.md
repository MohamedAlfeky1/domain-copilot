# System Architecture Document - Domain Copilot

## 1. C4 Model Level 1: System Context Diagram

```mermaid
C4Context
    title System Context Diagram for Domain Copilot

    Person(expert, "Domain Expert / Clinician", "Queries domain copilot and inspects structured citations.")
    Person(approver, "Authorized Approver", "Reviews and authorizes consequential side-effect actions.")
    
    System(copilot, "Domain Copilot Platform", "Agentic RAG engine with hybrid retrieval, specialist agents, and HITL governance.")
    
    System_Ext(openai, "OpenAI API", "Provides gpt-4o completions and text-embedding-3-small embeddings.")
    SystemDb_Ext(postgres, "PostgreSQL + pgvector", "Stores relational audit data and vector similarity indices.")

    Rel(expert, copilot, "Submits queries, uploads documents, views live stream", "HTTPS / SSE")
    Rel(approver, copilot, "Approves, edits, or rejects pending actions", "HTTPS")
    Rel(copilot, openai, "Generates embeddings and token completions", "TLS / REST")
    Rel(copilot, postgres, "Reads/writes chunks, embeddings, and traces", "TCP / SQL")
```

---

## 2. C4 Model Level 2: Container Diagram

```mermaid
C4Container
    title Container Diagram for Domain Copilot

    Person(user, "User (Expert/Approver)", "Authenticated actor")

    Container_Boundary(c1, "Domain Copilot System") {
        Container(web, "Next.js Frontend", "React 18, Tailwind, Lucide", "Responsive UI, real-time SSE stream consumer, evidence drawer.")
        Container(api, "Node.js API Route Handlers", "Next.js App Router (Node.js runtime)", "Orchestrates ingestion, retrieval, multi-agent workflows, and HITL gate.")
        ContainerDb(db, "Database & Vector Store", "PostgreSQL 16 + pgvector", "Relational entities, audit ledgers, and vector embeddings.")
    }

    System_Ext(llm, "External AI Provider", "OpenAI gpt-4o", "Cloud model execution")

    Rel(user, web, "Interacts with UI", "HTTPS")
    Rel(web, api, "API requests & SSE streams", "JSON / SSE")
    Rel(api, db, "Queries chunks, saves runs & traces", "SQL / pgvector")
    Rel(api, llm, "Prompt completion & embeddings", "REST")
```

---

## 3. End-to-End Workflow Sequence Diagram (With Approval & Streaming)

```mermaid
sequenceDiagram
    autonumber
    actor User as Domain Expert
    participant UI as Copilot Workspace
    participant API as API Boundary
    participant Ret as Hybrid Retriever
    participant S1 as Specialist 1 (Extractor)
    participant S2 as Specialist 2 (Auditor)
    participant S3 as Specialist 3 (Drafter)
    participant HITL as Approval Gate
    actor Approver as Reviewer

    User->>UI: Submit Question
    UI->>API: POST /api/queries
    API-->>UI: 201 Created (runId, correlationId)
    UI->>API: GET /api/runs/:id/stream (SSE)
    
    API->>Ret: Parallel Dense + Keyword Search
    Ret-->>API: Fused Ranked Chunks + Citations
    API-->>UI: event: citation ([Doc 1, p. 12])
    
    API->>S1: Extract Grounded Facts
    S1-->>API: Structured Fact Payload
    API-->>UI: event: step_complete (Specialist 1)
    
    API->>S2: Audit Risks & Contraindications
    S2-->>API: Risk Assessment + Proposed Action
    API-->>UI: event: step_complete (Specialist 2)
    
    opt Consequential Action Proposed
        API->>HITL: Create Approval Request (status: PENDING)
        API-->>UI: event: approval_req
        Approver->>HITL: POST /api/approvals/:id/approve
        HITL-->>API: Approval Granted
    end
    
    API->>S3: Stream Synthesis (gpt-4o)
    loop Token Generation
        S3-->>API: Delta Token
        API-->>UI: event: token
    end
    
    API-->>UI: event: done (Run Completed)
```

---

## 4. Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : owns
    USERS ||--o{ APPROVALS : reviews
    DOCUMENTS ||--o{ DOCUMENT_VERSIONS : has
    DOCUMENT_VERSIONS ||--o{ CHUNKS : splits_into
    DOCUMENT_VERSIONS ||--o{ INGESTION_JOBS : tracks
    CHUNKS ||--o{ CHUNK_EMBEDDINGS : embeds
    SESSIONS ||--o{ RUNS : contains
    RUNS ||--o{ RUN_STEPS : executes
    RUNS ||--o{ USAGE_LEDGER : records
    RUNS ||--o{ APPROVALS : triggers
    RUN_STEPS ||--o{ TOOL_CALLS : invokes
    APPROVALS ||--o{ APPROVAL_EVENTS : audits
```
