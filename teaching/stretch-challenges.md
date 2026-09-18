# Stretch Challenges & Answer Key (DEV-013)

## Stretch Challenge 1: Dynamic Top-K Adaptive Retrieval
**Objective:** Modify `src/core/application/retrieval/retrieval.service.ts` so that when the query is determined to be highly ambiguous (entropy > 0.7), the system dynamically scales `topK` from 5 to 12.

### Solution / Answer Key:
In `HybridRetrievalService.retrieve()`:
```typescript
const queryTerms = query.split(/\s+/).length;
const topK = queryTerms < 4 ? 12 : 5; // Scale depth for ambiguous/short queries
```

---

## Stretch Challenge 2: Cryptographically Signed Approval Tokens
**Objective:** Implement HMAC-SHA256 token signing in `src/core/application/approvals/approval.service.ts` so that approval tokens cannot be forged by rogue internal components.

### Solution / Answer Key:
```typescript
import { createHmac } from "crypto";

export function generateApprovalToken(approvalId: string, reviewerId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return createHmac("sha256", secret)
    .update(`${approvalId}:${reviewerId}:${Date.now()}`)
    .digest("hex");
}
```

---

## Stretch Challenge 3: Negative Ingestion Security Filter
**Objective:** Add an automated prompt injection filter during document extraction in `src/core/application/ingestion/ingestion.service.ts` that flags files containing suspicious override tokens (`IGNORE ALL PREVIOUS INSTRUCTIONS`).

### Solution / Answer Key:
```typescript
const JAILBREAK_REGEX = /(?:ignore|disregard)\s+(?:all\s+)?(?:previous\s+)?instructions/i;
if (JAILBREAK_REGEX.test(extractedContent)) {
  throw new IngestionFailedError("Document rejected: Suspicious prompt injection directives detected in raw text.");
}
```
