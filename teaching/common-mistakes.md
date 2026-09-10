# Five Common Trainee Misconceptions & Corrections (DEV-013)

### 1. Misconception: "Semantic Vector Search is Always Superior to Keyword Search"
- **Reality**: Pure vector search frequently fails on exact serial numbers, drug codes (e.g. "XR-402"), and statutory references ("Clause 12.B").
- **Correction**: Enterprise RAG systems must implement hybrid dense-keyword retrieval merged deterministically with Reciprocal Rank Fusion (RRF).

---

### 2. Misconception: "Hiding the Action Button in the UI is Sufficient Security"
- **Reality**: Client-side UI element suppression does not stop malicious actors or compromised agents from hitting backend REST endpoints directly.
- **Correction**: Consequential side-effect tools must enforce server-side approval token verification and cryptographic authorization checks independently of the UI.

---

### 3. Misconception: "LLMs Can Deterministically Refuse Just by Asking Them in the Prompt"
- **Reality**: Prompt instructions like *"If you don't know the answer, say you don't know"* still suffer from subtle hallucinations under low-evidence conditions.
- **Correction**: Implement an architectural Low-Evidence Refusal Gate that computes evidence confidence scores prior to calling the drafting LLM. If the score is below the safety floor, abort generation.

---

### 4. Misconception: "Fixed 500-Character Chunks are Fine for Any Document"
- **Reality**: Arbitrary character or token windows split medical dosage tables, break sentences in half, and destroy crucial section headings.
- **Correction**: Adopt structure-aware chunking that segments along natural paragraph and heading boundaries, preserving continuous page and section metadata.

---

### 5. Misconception: "Multi-Agent Systems Should Be Fully Autonomous Free Loops"
- **Reality**: Autonomous loops often enter infinite execution cycles, call tools uncontrollably, and exhaust token budgets.
- **Correction**: Enforce a deterministic Supervisor State Machine with bounded step timeouts, iteration circuit breakers (max 5 rounds), and explicit typed Zod contracts.
