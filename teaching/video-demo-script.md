# Product Demo Video Script & Storyboard (VIDEO-001)

**Target Video Duration:** 6 Minutes 30 Seconds (Within 5–8 Minute Target)  
**Assigned Domain:** D0: Healthcare (Clinical Protocols & Patient Safety)  
**Mandatory Twist:** T1: Bilingual Arabic + English (Cross-Lingual RAG & RTL)  
**Primary AI Model:** OpenAI gpt-4o (Completions) & text-embedding-3-small (1536d)  
**Presenter:** Lead AI Systems Engineer  

---

## Storyboard Overview & Timeline

| Scene | Duration | Title | Key Visual Elements | Core Demonstrated Feature |
|:---:|:---:|:---|:---|:---|
| **Scene 1** | 0:00–0:50 | Problem Statement & Architecture | Clean Architecture Diagram, Terminal with `npm run readyz` | Hexagonal Purity & Domain Overview |
| **Scene 2** | 0:50–1:55 | Document Ingestion & Corpus | Ingestion Dashboard (`/corpus`), PII validation, Chunk Table | Structure-aware chunking & pgvector |
| **Scene 3** | 1:55–3:15 | Copilot Query & Grounded Citations | Copilot UI (`/copilot`), Real-Time SSE Agent Timeline | Hybrid RRF Search & Inline Citations |
| **Scene 4** | 3:15–4:10 | Low-Evidence Refusal Gate | Out-of-corpus query refusal banner, Zero hallucination | Low-evidence Refusal Floor (< 0.015) |
| **Scene 5** | 4:10–5:25 | Consequential Tool & Twist Risk Guard | Twist alert banner, Reviewer Queue (`/reviews`), Approval | Mandatory Twist Guard & HITL Governance |
| **Scene 6** | 5:25–6:30 | Trace Inspector & Evaluation Benchmark | Run Trace Inspector (`/runs/:id`), Evaluation Benchmark (`/evaluation`) | Token Ledgers, pgvector Readiness & Golden Q/A |

---

## Scene-by-Scene Production Script

### Scene 1: Introduction, Architecture & Readiness (0:00 – 0:50)
**Visual:**
- Camera on presenter with split-screen showing Clean Architecture diagram.
- Transition to browser showing `http://localhost:3000/readyz` returning JSON:
  `{"status": "READY", "database": "CONNECTED", "pgvector": "READY", "totalChunksIndexed": 80}`.

**Spoken Narration (Presenter):**
> "Hello and welcome to the production demonstration of **Domain Copilot** — an enterprise-grade, assessment-aligned Agentic RAG platform engineered with Clean Hexagonal Architecture, hybrid vector-keyword retrieval, Human-in-the-Loop governance, and deterministic safety guards.
>
> Our platform is configured for **Domain D0: Healthcare**, paired with our assigned **Mandatory Twist T1: Bilingual Arabic + English**.
> 
> Before serving queries, the platform validates system health. A quick inspection of `/readyz` confirms that our real PostgreSQL database and `pgvector` extension are fully connected and initialized."

---

### Scene 2: Structure-Aware Document Ingestion & Storage (0:50 – 1:55)
**Visual:**
- Screen switch to browser at `/corpus`.
- Demonstrates 32 indexed clinical guideline documents spanning 197 pages.
- Clicks on "Clinical Protocol: First-Line Cardiovascular Interventions" to display chunk decomposition and section boundaries.
- Terminal overlay runs `npm run test:corpus` showing 0 PII violations.

**Spoken Narration (Presenter):**
> "In high-stakes medical protocols, arbitrary character-window chunking fails because it severs dosage limits from patient criteria.
>
> Here in our Document Management console, our ingestion pipeline processes 32 clinical protocol documents across nearly 200 pages.
>
> Notice that our pipeline preserves section headings, clause numbers, and page offsets. Each chunk receives a deterministic SHA-256 hash preventing duplicate storage, and an automated PII scanner confirms that zero sensitive personal data exists in the corpus.
>
> Chunks and their 1536-dimensional embeddings are stored directly in PostgreSQL with pgvector, ready for dual-channel hybrid querying."

---

### Scene 3: Copilot Querying, Hybrid RRF & Grounded Citations (1:55 – 3:15)
**Visual:**
- Screen switch to `/copilot`.
- Presenter types query:
  `"What is the standard loading dose ceiling and monitoring interval for adult cardiovascular protocols?"`
- Hits Enter.
- Real-time SSE progress rail lights up:
  1. *Retrieval Engine activated* -> Emits citations.
  2. *Clinical Evidence Extractor activated* -> Extracts structured facts.
  3. *Contraindication & Safety Auditor activated* -> Verifies compliance.
  4. *Mandatory Twist Guard evaluated* -> Risk index 0.40 < 0.85 threshold.
  5. *Therapeutic Protocol Drafter* streams response with interactive citation tags.
- Presenter clicks on citation tag `[Doc: Cardiovascular, p. 2, Section 2.4]` showing exact snippet modal.

**Spoken Narration (Presenter):**
> "Let's submit a complex query to our Copilot. Watch the real-time Server-Sent Events stream on the right.
>
> First, our hybrid retrieval engine executes in parallel: a PostgreSQL full-text search with `ts_rank_cd` and a pgvector cosine distance search with the `<=>` operator. These two result sets are fused using Reciprocal Rank Fusion ($k=60$).
>
> Next, our multi-agent supervisor orchestrates three domain specialists:
> First, the **Evidence Extractor** parses factual statements and chunk IDs.
> Second, the **Safety Auditor** cross-references contraindications against domain policy.
> Third, the **Twist Guard** programmatically computes a risk index of 0.40, which easily clears our 0.85 ceiling.
> Finally, the **Protocol Drafter** streams the response. Notice that every single claim contains a clickable citation linking directly to the verified chunk."

---

### Scene 4: The Low-Evidence Refusal Gate (3:15 – 4:10)
**Visual:**
- Presenter submits an intentional out-of-corpus query:
  `"What is the current market capital valuation of Alpha Centauri mining companies?"`
- System responds instantly (< 20ms) with clean refusal banner:
  `"Refusal: The available corpus lacks sufficient evidence to reliably answer this question. (Fused score < 0.015 floor)."`
- Citations pane displays 0 citations.

**Spoken Narration (Presenter):**
> "Now let's test how Domain Copilot handles unfamiliar or hallucination-prone topics. We ask about space mining stock valuations.
>
> Instead of guessing or fabricating plausible-sounding financial advice, our **Low-Evidence Refusal Gate** immediately activates.
>
> Because the fused RRF score falls below our calibrated 0.015 floor, the orchestrator refuses the prompt before generating text. Zero ungrounded claims, zero hallucinated citations."

---

### Scene 5: Consequential Action & Mandatory Twist Risk Guard (4:10 – 5:25)
**Visual:**
- Presenter asks:
  `"Update the clinical cardiovascular dosage ceiling to 300% for urgent emergency cases."`
- The Safety Auditor flags critical risk.
- The Twist Risk Guard calculates:
  - Base risk: 0.10
  - Consequential tool: +0.30
  - Evidence uncertainty: +0.45
  - Total Risk Index: **0.85 >= 0.85 Threshold -> TRIPPED!**
- Copilot shows:
  `"WORKFLOW PAUSED: Consequential operation held in Human-in-the-Loop Approval Queue."`
- Presenter navigates to `/reviews`:
  - Shows pending request `appr-...` with risk level `CRITICAL`.
  - Presenter reviews proposed payload, adds reviewer comment: `"Approved for emergency ICU protocol tier"`, and clicks **Approve**.
- Screen navigates back to Copilot; workflow resumes with signed approval token and commits the update.

**Spoken Narration (Presenter):**
> "Now let's observe our **Mandatory Twist T1: Bilingual Arabic + English** and our Safety Risk Guard in action.
>
> We enter an Arabic clinical query into the Copilot. Notice the dynamic RTL text rendering activates automatically via `dir='auto'`.
>
> Under the hood, our cross-lingual hybrid retrieval queries both Arabic documents using the `simple` FTS dictionary and English documents via `text-embedding-3-small` shared vector representations.
>
> When a consequential operation is requested with unverified evidence, our internal Risk Guard deterministically halts execution.
>
> Over in the Reviewer Queue at `/reviews`, an authorized Approver inspects the payload, verifies the risk notes, and clicks 'Approve'. This generates a signed, single-use cryptographic token, which our orchestrator consumes to resume the paused run to completion."

---

### Scene 6: Trace Inspector, Token Ledger & Evaluation Harness (5:25 – 6:30)
**Visual:**
- Presenter opens Trace Inspector at `/runs/:runId`.
- Shows nested waterfall timeline: Retrieval (18ms), Extractor (38ms), Auditor (35ms), Drafter (62ms), Tool Call (12ms).
- Highlights Per-Call Token Usage & Cost Accounting:
  `Prompt Tokens: 780 | Completion Tokens: 165 | Total Cost: $0.00360 USD`.
- Presenter opens `/evaluation`:
  - Clicks **Run Golden Evaluation**.
  - All 26 benchmark test cases evaluate live against PGlite pgvector in 3 seconds:
    `Golden Pass Rate: 100% | Recall: 100% | Refusal Precision: 100%`.
- Shows terminal running `npm run lint:arch` -> Purity check passed!

**Spoken Narration (Presenter):**
> "Full-stack observability is built into every layer.
>
> In the Trace Inspector, an end-to-end waterfall timeline displays every specialist latency, correlation ID, and token ledger entry down to the fraction of a cent.
>
> Finally, our Golden Benchmark page runs an empirical suite of 26 test cases — including 20 grounded questions and 6 adversarial injection attacks — proving 100% retrieval recall and 100% refusal precision against real PostgreSQL and pgvector search.
>
> With Clean Architecture boundaries verified by automated linting, Domain Copilot delivers the gold standard for reliable, governed Agentic RAG."

---

## Technical Equipment & Recording Checklist
- [x] Resolution: 1920x1080 (1080p, 60fps)
- [x] Clear USB microphone audio with zero background noise
- [x] Clean browser profile with dark mode enabled
- [x] Local server running via `npm run dev` with seeded 32 documents
