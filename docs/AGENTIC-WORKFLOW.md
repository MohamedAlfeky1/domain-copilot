# Agentic Coding Workflow & AI Governance Pack (DEV-010)

This repository was developed using structured, governed AI-assisted workflows to ensure high engineering standards, clean architecture boundaries, and auditable code generation.

## Implemented AI Workflow Mechanisms (>= 5 Implemented)

1. **Project Instruction File**: Strict repository rules embedded in prompt guidelines (Clean Architecture boundaries, typed domain errors, zero framework imports in domain core).
2. **Versioned Prompt Assets**: Specialist prompts externalized as versioned TypeScript constants (`src/core/application/agents/orchestrator.service.ts`), not ad-hoc inline strings.
3. **Specialized Sub-Agents**: Separation of concerns between Evidence Extraction Agent, Compliance Audit Agent, and Protocol Drafting Agent.
4. **Automated Quality Hooks**:
   - `scripts/lint-arch.js`: Detects forbidden framework imports in the pure domain layer.
   - `scripts/test-corpus.js`: Verifies document count (>= 30), page count (>= 150), and absence of PII before merges.
5. **Deterministic Testing Harness**: Golden Q/A benchmark (`scripts/eval-runner.js`) and prompt injection security suites (`scripts/test-security.js`) run on every change.
6. **AI Usage Audit Trail**: Continuous tracking of delegated engineering tasks and human verification in `docs/AI-USAGE-LOG.md`.

## Lessons Learned & Agentic Failure Modes
- **Delimiter Confusion**: LLMs attempting to parse unescaped XML tags in evidence strings required strict sanitization of `</untrusted_evidence>` delimiters.
- **Over-Permissive Tool Invocations**: LLMs will invoke side-effecting tools unless bounded by hard schema allow-lists and cryptographic HITL approval tokens.
