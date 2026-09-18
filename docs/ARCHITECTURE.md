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

---

## 5. C4 Model Level 3: Component Diagram (API & Application Core)

The C4 Level 3 diagram shows the structural decomposition of the Next.js API boundary and the Clean Architecture application container, detailing component responsibilities and interaction with domain ports and infrastructure adapters.

```mermaid
C4Component
    title Component Diagram for Domain Copilot (Clean Architecture)

    Container_Boundary(api, "Domain Copilot Core System") {
        Component(route_queries, "Query Controller", "Next.js Route Handler (/api/queries)", "Validates input queries, checks RBAC session, and initiates orchestrator execution runs.")
        Component(route_stream, "Stream Controller", "Next.js Route Handler (/api/runs/[id]/stream)", "Streams real-time Server-Sent Events (SSE) for agent steps, tokens, and citations.")
        Component(route_approvals, "Approval Controller", "Next.js Route Handler (/api/approvals)", "Manages pending HITL approvals, reviews, two-phase commits, and rejections.")
        Component(route_docs, "Ingestion Controller", "Next.js Route Handler (/api/documents)", "Handles document uploads, quality gate validation, and ingestion jobs.")

        Component(orchestrator, "Multi-Agent Orchestrator", "Application Service", "Coordinates Extractor, Auditor, and Drafter specialist agents with circuit breaker caps.")
        Component(retrieval_svc, "Hybrid Retrieval Service", "Application Service", "Coordinates dense vector and sparse keyword search with RRF k=60 and refusal floors.")
        Component(ingestion_svc, "Ingestion Service", "Application Service", "Extracts text/OCR, creates semantic chunks, and generates embeddings.")
        Component(approval_svc, "Approval Service", "Application Service", "Enforces HITL two-phase commit gating for consequential side-effect actions.")
        Component(tool_reg, "Tool Registry & Security Guard", "Application Service", "Role-based tool allow-listing and deterministic twist risk guard enforcement.")

        Component(domain_ports, "Domain Ports & Entities", "Domain Core Layer", "Defines IAIProviderPort, IDatabasePort, IVectorStorePort, ITwistPort, IOCRPort, and core domain entities.")

        Component(ai_factory, "AI Provider Factory & Adapters", "Infrastructure Layer", "Resolves and drives OpenAI, OpenRouter, and Gemini embedding adapters.")
        Component(db_adapter, "Database & Vector Store Adapter", "Infrastructure Layer", "Implements IDatabasePort and IVectorStorePort on PostgreSQL 16 pgvector / PGlite.")
        Component(twist_adapter, "Bilingual Twist Adapter", "Infrastructure Layer", "Implements ITwistPort for Arabic/English detection, cross-lingual routing, and risk guards.")
        Component(ocr_adapter, "Tesseract OCR Adapter", "Infrastructure Layer", "Implements IOCRPort for optical character recognition on scanned PDFs.")
    }

    ContainerDb_Ext(postgres, "PostgreSQL 16 + pgvector", "Relational & Vector Store", "Stores documents, versions, chunks, chunk_embeddings, sessions, runs, approvals.")
    System_Ext(gemini_api, "Google Gemini API", "Embedding Service", "models/gemini-embedding-001 (1536d normalized vectors)")
    System_Ext(llm_api, "OpenAI / OpenRouter API", "LLM Generation", "Cloud model execution for specialist agent reasoning and drafting")

    Rel(route_queries, orchestrator, "Dispatches query run", "Method Call")
    Rel(route_approvals, approval_svc, "Manages approval lifecycle", "Method Call")
    Rel(route_docs, ingestion_svc, "Dispatches ingestion job", "Method Call")
    Rel(orchestrator, retrieval_svc, "Retrieves grounded evidence", "Method Call")
    Rel(orchestrator, tool_reg, "Executes permitted tools", "Method Call")
    Rel(orchestrator, approval_svc, "Checks / creates approval requests", "Method Call")
    Rel(orchestrator, ai_factory, "Invokes LLM specialists", "Method Call")
    Rel(orchestrator, twist_adapter, "Evaluates risk guard & language", "Method Call")
    Rel(retrieval_svc, ai_factory, "Generates query embeddings", "Method Call")
    Rel(retrieval_svc, db_adapter, "Executes vector cosine <=> and FTS ts_rank_cd", "Method Call")
    Rel(ingestion_svc, ai_factory, "Generates chunk embeddings", "Method Call")
    Rel(ingestion_svc, ocr_adapter, "Extracts scanned text if needed", "Method Call")
    Rel(ingestion_svc, db_adapter, "Persists chunks and vectors", "Method Call")
    Rel(tool_reg, twist_adapter, "Enforces safety risk guard floor (0.35)", "Method Call")
    Rel(ai_factory, gemini_api, "Generates 1536d embeddings", "HTTPS / REST")
    Rel(ai_factory, llm_api, "Generates completions", "HTTPS / REST")
    Rel(db_adapter, postgres, "Reads/writes relational & vector records", "SQL / pgvector")
```

---

## 6. End-to-End Data Flow Diagram

This diagram traces the exact data flow through document ingestion, hybrid vector/keyword retrieval, evidence threshold evaluation, specialist agent deliberation, and human-in-the-loop governance.

```mermaid
flowchart TD
    subgraph INGESTION["1. Document Ingestion Pipeline"]
        A1["Raw Document / Corpus File (.txt, .pdf)"] --> A2{"Text Extraction & Quality Gate"}
        A2 -- "Text Available" --> A3["Semantic Chunker (300-800 tokens, 100 overlap)"]
        A2 -- "Scanned / Low Density" --> A2_OCR["Tesseract OCR Fallback (ara + eng)"]
        A2_OCR --> A3
        A3 --> A4["SHA-256 Digest & Chunk Metadata Calculation"]
        A4 --> A5["Gemini Embedding Adapter (models/gemini-embedding-001)<br/>Task: RETRIEVAL_DOCUMENT | 1536d L2-Normalized"]
        A5 --> A6[("PostgreSQL 16 + pgvector<br/>chunks & chunk_embeddings")]
    end

    subgraph RETRIEVAL["2. Hybrid Retrieval Engine (RET-001 to RET-006)"]
        B1["User Query via Web UI / API"] --> B2["Language & Twist Router<br/>T1 Bilingual: Arabic vs English"]
        B2 --> B3["Gemini Embedding Adapter<br/>Task: RETRIEVAL_QUERY | 1536d Vector"]
        
        B3 --> B4a[("pgvector Cosine Search<br/>chunks <=> query_vector")]
        B2 --> B4b[("PostgreSQL Full-Text Search<br/>to_tsquery('simple'|'english') ts_rank_cd")]
        
        B4a --> B5["Reciprocal Rank Fusion (RRF k=60)<br/>score = sum(1 / (60 + rank))"]
        B4b --> B5
        
        B5 --> B6{"Evidence Floor Gate<br/>Fused Score >= 0.015 ?"}
        B6 -- "Score < 0.015 (Insufficient)" --> B7["Refusal Path<br/>0 Hallucination | Explainable Reason"]
        B6 -- "Score >= 0.015 (Grounded)" --> B8["Ranked Grounded Chunks & Exact Citations"]
    end

    subgraph AGENTIC["3. Multi-Agent Deliberation & HITL Governance"]
        B8 --> C1["Sanitize Prompt Boundary<br/>Neutralize Injections & Escape XML Delimiters"]
        C1 --> C2["Specialist 1: Evidence Extractor<br/>Structured JSON Fact Extraction"]
        C2 --> C3["Specialist 2: Safety & Risk Auditor<br/>Protocol & Contraindication Audit"]
        
        C3 --> C4{"Consequential Action<br/>Proposed?"}
        C4 -- "No Side Effect" --> C8["Specialist 3: Drafter<br/>Stream Grounded Answer (gpt-4o)"]
        C4 -- "Consequential Side Effect" --> C5{"Twist Risk Guard<br/>Evidence Score >= 0.35?"}
        C5 -- "Score < 0.35 (Uncertain)" --> C6["Blocked by Safety Risk Guard<br/>SideEffectBlockedError"]
        C5 -- "Score >= 0.35" --> C7["HITL Approval Gate<br/>Status: PENDING"]
        
        C7 --> C7a{"Authorized Approver<br/>Manual Decision"}
        C7a -- "Approved" --> C7b["Two-Phase Commit Executed with Token"]
        C7b --> C8
        C7a -- "Rejected / Edited" --> C8
        
        C8 --> C9["Real-Time SSE Stream to UI<br/>Tokens + Verified Citations + Audit Traces"]
    end
```

---

## 7. Clean Architecture Dependency Diagram

The dependency diagram illustrates the concentric Clean Architecture layer boundaries implemented across `src/core` and `src/infrastructure`. In accordance with the Dependency Inversion Principle, source code dependencies point strictly inward toward the Domain Core.

```mermaid
flowchart TD
    subgraph FRAMEWORKS["Frameworks & Drivers Layer (External / Concrete)"]
        F1["Next.js 14 App Router (API Route Handlers & Edge Middleware)"]
        F2["React 18 Web UI Shell (Tailwind CSS, Radix UI, Lucide)"]
        F3["PostgreSQL 16 with pgvector extension / In-Memory PGlite"]
        F4["Google Gemini API (models/gemini-embedding-001)"]
        F5["OpenAI / OpenRouter API (gpt-4o / gemma-4-31b-it)"]
        F6["Tesseract OCR Binary (Optical Character Recognition)"]
    end

    subgraph ADAPTERS["Interface Adapters Layer (src/infrastructure)"]
        A1["DatabaseAdapter<br/>Implements IDatabasePort & IVectorStorePort"]
        A2["GeminiEmbeddingAdapter<br/>Implements IAIProviderPort"]
        A3["OpenAIAdapter & OpenRouterAdapter<br/>Implements IAIProviderPort"]
        A4["TwistAdapter (Bilingual AR+EN)<br/>Implements ITwistPort"]
        A5["TesseractOcrAdapter<br/>Implements IOCRPort"]
        A6["AuthAdapter & RBAC Middleware<br/>Session & Token Validation"]
        A7["Dependency Injection Container<br/>buildContainer() in container.ts"]
    end

    subgraph APPLICATION["Application Business Rules Layer (src/core/application)"]
        S1["MultiAgentOrchestrator Service"]
        S2["HybridRetrievalService"]
        S3["IngestionService"]
        S4["ApprovalService"]
        S5["ToolRegistry & Deterministic Risk Guards"]
        
        subgraph PORTS["Application Ports (Interfaces)"]
            P1["IAIProviderPort"]
            P2["IDatabasePort"]
            P3["IVectorStorePort"]
            P4["ITwistPort"]
            P5["IOCRPort"]
        end
    end

    subgraph DOMAIN["Enterprise Business Rules Layer (src/core/domain)"]
        D1["Core Entities & Types<br/>Document, DocumentVersion, Chunk, ChunkEmbedding,<br/>Session, Run, RunStep, ToolCall, ApprovalRequest, Citation"]
        D2["Domain Error Hierarchy<br/>ValidationError, NotFoundError, UnauthorizedError,<br/>SideEffectBlockedError, RefusalError, CircuitBreakerError"]
    end

    %% Inward Dependency Flow (Dependency Inversion Principle)
    FRAMEWORKS --> ADAPTERS
    ADAPTERS --> PORTS
    ADAPTERS -.-> DOMAIN
    APPLICATION --> DOMAIN
    PORTS --> DOMAIN
    A7 --> APPLICATION
    A7 --> ADAPTERS
```
