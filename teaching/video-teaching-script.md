# Technical Teaching Session Script & Recording Plan (VIDEO-002)

**Topic:** Engineering Production Hybrid RAG & Deterministic Multi-Agent Supervisors  
**Target Video Duration:** 10 Minutes 30 Seconds (Target: ~10 Minutes)  
**Format:** Webcam Video in Corner + Slide Deck + Visual Studio Code Walkthrough  
**Audience:** Postgraduate Engineers & Senior AI Software Architects  
**Prerequisites:** Familiarity with Vector Embeddings, PostgreSQL, and TypeScript  

---

## 10-Minute Lecture Schedule & Teaching Plan

| Segment | Duration | Topic | Format | Visual Asset |
|:---:|:---:|:---|:---|:---|
| **Seg 1** | 0:00–1:30 | The Core Problem: Why Dense-Only RAG Fails in Production | Slides + Webcam | Slide 3 (Naive RAG Failure Modes) |
| **Seg 2** | 1:30–4:00 | Mathematical Deep-Dive: Hybrid Search & RRF ($k=60$) | Slide + Whiteboard | Slide 7 & 8 (RRF Formulation) |
| **Seg 3** | 4:00–6:30 | Deterministic Multi-Agent State Machines & Circuit Breakers | Code Walkthrough | `src/core/application/agents/orchestrator.service.ts` |
| **Seg 4** | 6:30–8:30 | The Mandatory Twist: Enforcing Hard Risk Ceilings | Code Walkthrough | `src/infrastructure/twist/twist.adapter.ts` |
| **Seg 5** | 8:30–10:30 | Testing & Verifying AI Systems Without Cloud Credentials | Terminal / Tests | `scripts/eval-runner.js` & `npm run eval` |

---

## Complete Lecture Narration & Screen Walkthrough Script

### Segment 1: The Core Problem: Why Dense-Only RAG Fails in Production (0:00 – 1:30)
**Visual Setup:**
- Presenter webcam feed (top right).
- Fullscreen Slide 3: *"The 4 Fatal Failure Modes of Naive RAG"*.

**Instructor Narration:**
> "Welcome everyone to today's technical deep dive. In this session, we are going to look under the hood of enterprise Agentic RAG and answer a fundamental question:
> 
> *Why does standard, off-the-shelf naive RAG fail when deployed in mission-critical, regulated environments?*
> 
> When engineers build their first prototype with LangChain or LlamaIndex, they typically take a PDF, split it into 500-token chunks, compute vector embeddings with OpenAI, and run a top-k cosine similarity search.
> 
> But in clinical protocols, legal contracts, or financial risk management, that approach breaks down in four specific ways:
> 
> 1. **Table Severance:** Chunk boundaries cut right through dosage tables, separating a drug from its absolute contraindications.
> 2. **Lexical Blindness:** Dense embeddings represent semantic concepts, not exact alphanumeric strings. If a clinician asks for 'Section 14.2(b)', cosine distance often ranks general paragraphs higher than the actual section.
> 3. **The Compulsion to Guess:** When evidence is missing, generative models hallucinate plausible-sounding answers instead of raising a structured refusal.
> 4. **Unconstrained Tool Agency:** Giving an LLM raw API write access without a deterministic human review gate is an invitation to production incidents.
> 
> Today, we're going to build the solution."

---

### Segment 2: Mathematical Deep-Dive: Hybrid Search & Reciprocal Rank Fusion (1:30 – 4:00)
**Visual Setup:**
- Transition to Slide 7 & 8.
- Digital whiteboard showing the RRF mathematical formula:
  $$RRF(d) = \sum_{m \in \{\text{dense}, \text{keyword}\}} \frac{1}{60 + \text{rank}_m(d)}$$

**Instructor Narration:**
> "To solve the lexical-semantic mismatch, we must use a **dual-channel hybrid retrieval engine**.
> 
> On Channel A, we run real dense vector cosine similarity in PostgreSQL using the `pgvector` extension and the `<=>` operator. This captures semantic context and paraphrased intent.
> 
> On Channel B, we run native PostgreSQL Full-Text Search using `to_tsvector` and `ts_rank_cd`. This captures exact lexical tokens, pharmaceutical names, and statutory section numbers.
> 
> But here is the critical engineering hurdle: *How do you fuse these two streams?*
> 
> You cannot simply average the cosine similarity score with the full-text rank score. Why? Because cosine distance is bounded between 0 and 1 with a bell curve distribution, whereas `ts_rank_cd` is unbounded, often ranging from 0.01 to 15.0 depending on term frequency.
> 
> If you add them directly, the keyword channel will drown out the dense channel.
> 
> The mathematically sound solution is **Reciprocal Rank Fusion (RRF)**. Notice the formula on your screen:
> We evaluate only the **rank position** of candidate document $d$ in each channel, smoothed by constant $k=60$.
> 
> If a document ranks #1 in dense and #1 in keyword, its fused score is:
> $$\frac{1}{60 + 1} + \frac{1}{60 + 1} = \frac{1}{61} + \frac{1}{61} \approx 0.0328$$
> 
> If a document ranks #1 in keyword but is completely absent from the dense top-10, its score is only $1/61 \approx 0.0164$.
> 
> This provides a calibrated, monotonic score that guarantees dual-channel consensus always wins."

---

### Segment 3: Deterministic Multi-Agent State Machines & Circuit Breakers (4:00 – 6:30)
**Visual Setup:**
- Switch to VS Code.
- Open `src/core/application/agents/orchestrator.service.ts` around line 98.
- Highlight `MAX_ITERATIONS = 5` and `STEP_TIMEOUT_MS = 30000`.

**Instructor Narration:**
> "Now let's examine the multi-agent supervisor state machine.
> 
> A common anti-pattern in agentic coding is building autonomous multi-agent loops that run indefinitely without execution ceilings. In production, an autonomous agent caught in an ambiguous loop will burn thousands of dollars in tokens or timeout the client connection.
> 
> Notice lines 99 to 101 in our `MultiAgentOrchestrator`:
> We enforce two non-negotiable invariants:
> - First, a hard `MAX_ITERATIONS` ceiling of 5 iterations.
> - Second, a per-step timeout of 30,000 milliseconds using `createStepTimeout`.
> 
> Now let's scroll down to `executeWorkflow`. Rather than having a single mega-prompt, we divide responsibility into three discrete specialist contracts:
> 1. **Specialist 1: Clinical Evidence Extractor.** Its only job is to extract factual statements and attach their chunk IDs. It is governed by `ExtractorOutputSchema` in Zod.
> 2. **Specialist 2: Contraindication & Safety Auditor.** It consumes the output of Specialist 1, checks domain risk policy, and flags severity levels.
> 3. **Specialist 3: Therapeutic Protocol Drafter.** It consumes the auditor's findings and generates the final synthesis with mandatory inline citations.
> 
> If any specialist outputs malformed JSON, our `executeAndValidateAgent` helper catches the validation error and injects a corrective feedback loop, self-healing the response."

---

### Segment 4: The Mandatory Twist: Enforcing Hard Risk Ceilings (6:30 – 8:30)
**Visual Setup:**
- VS Code showing `src/infrastructure/twist/twist.adapter.ts`.
- Highlight `detectLanguage()`, `getCrossLingualConfig()`, `getFTSConfig()`, and `evaluateRiskGuard()`.

**Instructor Narration:**
> "Now let's discuss our assigned mandatory twist: **T1: Bilingual Arabic + English (AR+EN)**.
> 
> In enterprise RAG architectures, handling multilingual corpora often falls into two anti-patterns: either calling an external translation API on every incoming query — which adds 800 milliseconds of latency, increases costs, and mangles clinical terminology — or maintaining separate, isolated monolingual databases.
> 
> Instead, our solution implements a clean port-and-adapter architecture behind `ITwistPort`:
> 
> 1. **Dynamic Language Detection**: We use Unicode block analysis (`\u0600-\u06FF`) to detect Arabic, English, or code-switched inputs in microseconds with zero external dependencies.
> 2. **Cross-Lingual Dense Space**: Because `text-embedding-3-small` is natively multilingual, Arabic and English clinical concepts project into the exact same vector space. An English clinical query can retrieve Arabic clinical guidelines directly.
> 3. **FTS Dictionary Routing**: For lexical search, our adapter routes Arabic tokens to PostgreSQL's `simple` dictionary and English tokens to the `english` stemmer.
> 4. **Bi-Directional UI Rendering**: Any Arabic content automatically receives `dir='auto'` and RTL CSS layout rules.
> 
> Furthermore, we preserve our deterministic Side-Effect Risk Guard as an internal safety invariant: if an action attempts high-consequence mutations with unverified evidence (< 0.35 confidence), it halts execution and routes to the Human-in-the-Loop approval gate."

---

### Segment 5: Testing & Verifying AI Systems Without Cloud Credentials (8:30 – 10:30)
**Visual Setup:**
- VS Code split terminal.
- Run `npm run test:unit`, followed by `npm run test:security`, and `npm run eval`.

**Instructor Narration:**
> "Finally, let's talk about the testing pyramid.
> 
> A mature AI engineering team cannot rely on manual chatbot probing. You must have automated, offline regression suites that run in CI on every Git pull request with zero external API credentials.
> 
> Watch our terminal:
> First, `npm run test:unit` runs 14 tests in under 2 seconds. It tests vector math, cosine orthogonality, SHA-256 idempotency, and our database readiness check.
> 
> Second, `npm run test:security` executes our prompt injection suite. It verifies that closing delimiter injections like `</untrusted_evidence>` are sanitized, that DAN overrides are redacted, and that unauthorized agents cannot invoke side-effecting tools.
> 
> Third, `npm run eval` spins up real PGlite with pgvector and evaluates 26 golden benchmark cases — 20 grounded questions and 6 adversarial injections — achieving 100% retrieval recall and 100% refusal precision in under 4 seconds.
> 
> By anchoring your RAG systems in Clean Architecture, hybrid mathematical fusion, and deterministic governance, you eliminate hallucinations and deliver reliable, mission-critical AI.
> 
> Thank you for watching, and I look forward to reviewing your lab submissions!"

---

## Production Recording Notes
- **Resolution:** 1080p 60fps
- **Presenter Attire:** Professional technical casual
- **Screen Layout:** 80% screen content (VS Code / Deck), 20% picture-in-picture presenter
- **Audio:** Crisp condenser microphone, normalized to -14 LUFS
