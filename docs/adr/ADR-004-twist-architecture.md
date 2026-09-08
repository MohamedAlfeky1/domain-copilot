# ADR-004: Mandatory Twist Port-Adapter Boundary & Isolation

## Status
Accepted

## Context
The assessment mandates implementing a specific variant twist (T1: Deterministic Side-Effect Risk Guard) derived from the candidate's invitation or National ID. Hardcoding variant-specific logic directly across domain entities creates high architectural coupling and renders the platform difficult to maintain or retarget.

## Decision
1. Define a clean `ITwistAdapter` port interface within the application layer.
2. Implement the assigned twist in `src/infrastructure/twist/twist.adapter.ts`.
3. Protect high-consequence tool actions by asserting the twist risk guard before delegating execution to the Human-in-the-Loop gate.
4. Enforce fail-fast runtime verification (`assertVariantLocked()`) to prohibit raw placeholder strings ("D<n>", "T<n>") from executing in production.

## Alternatives Considered & Rejected
- **Inline Conditional Statements in Agent Prompts**: Rejected because prompt instructions alone cannot guarantee deterministic enforcement of hard risk floors.
- **Dynamic Plugin Loader**: Rejected as overengineered for the MVP scope.

## Consequences
- **Positive**: Strict isolation of twist rules; unit tests can stub the twist port without altering business logic.
- **Negative**: Adds an additional interface layer.
