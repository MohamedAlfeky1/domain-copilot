# ADR-002: Supervisor Orchestration State Machine Pattern

## Status
Accepted

## Context
Multi-agent systems composed of autonomous, unstructured LLM loops are prone to infinite hallucination cycles, nondeterministic tool calls, and high token exhaustion. Regulated enterprise domains demand strict predictability, bounded timeouts, and explicit state transitions.

## Decision
1. Adopt a deterministic Supervisor State Machine pattern where the orchestrator controls workflow progression:
   `Retrieval -> Specialist 1 (Extractor) -> Specialist 2 (Auditor) -> Specialist 3 (Drafter) -> Approval Gate -> Done`.
2. Define typed input/output contracts for every specialist using Zod discriminated schemas.
3. Enforce hard execution caps: maximum 5 iterations and 30-second step timeouts with circuit-breaker termination.

## Alternatives Considered & Rejected
- **Fully Autonomous Agent Swarm (AutoGPT style)**: Rejected due to inability to audit step sequences and high risk of tool loops.
- **Single Monolithic Prompt**: Rejected because complex domain reasoning requires separating raw evidence extraction from clinical compliance auditing.

## Consequences
- **Positive**: Complete step traceability, transparent progress rail in UI, and zero runaway token spend.
- **Negative**: Adds orchestrator coordination code.
