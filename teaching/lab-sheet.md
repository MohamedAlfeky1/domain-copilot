# Hands-on Lab Sheet: Building & Governing Agentic RAG

## Lab Objective
In this 90-minute session, trainees will explore the Domain Copilot architecture, execute hybrid retrieval queries, inspect multi-agent waterfalls, and enforce human-in-the-loop approval gates.

## Prerequisites
- Node.js v20+ LTS installed.
- Git clone of the `Ai Rag` repository.

## Lab Exercises

### Exercise 1: Clean Architecture Verification (10 mins)
1. Execute the architecture boundary linter:
   ```bash
   npm run lint:arch
   ```
2. Verify that `src/core/domain/types.ts` contains zero imports of external web or AI packages.

### Exercise 2: Corpus Seeding & Validation (15 mins)
1. Run the automated corpus seeder:
   ```bash
   npm run seed:corpus
   ```
2. Run the corpus validation check:
   ```bash
   npm run test:corpus
   ```
3. Ensure document count $\ge 30$ and page count $\ge 150$.

### Exercise 3: Running the Application & Testing Grounded Queries (25 mins)
1. Launch the Next.js development server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:3000/copilot` in your browser.
3. Submit the query: *"What are the first-line therapeutic indications for drug interaction protocol?"*
4. Observe the live Multi-Agent Progress Rail advance through:
   - Retrieval Engine -> Specialist 1 -> Specialist 2 -> Specialist 3.
5. Click a citation chip to open the Source Evidence Drawer and inspect the verbatim chunk text.

### Exercise 4: Testing Low-Evidence Refusal (15 mins)
1. On `/copilot`, submit an out-of-corpus query: *"What is the capital city of planet Neptune?"*
2. Confirm the system triggers `REFUSED: LOW EVIDENCE` without hallucinating facts.

### Exercise 5: HITL Consequential Action Governance (15 mins)
1. Navigate to `/reviews`.
2. Inspect the pending consequential action.
3. Test the **Edit & Approve** flow: Modify the payload JSON and click Approve.
4. Confirm the action executes with the modified payload.

### Exercise 6: Golden Benchmark Evaluation (10 mins)
1. In your terminal, run the evaluation benchmark:
   ```bash
   npm run eval
   ```
2. Inspect the pass rate and average latency reported in `docs/EVALUATION.md`.
