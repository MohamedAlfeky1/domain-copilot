# Expected Outputs - Hands-on Lab

## Exercise 1: Architecture Boundary Linter
```
==================================================
CLEAN ARCHITECTURE BOUNDARY LINT (DEV-001)
Inspecting: src/core/domain
==================================================
✓ Zero forbidden external framework imports found in Domain layer.
✓ Domain purity check PASSED!
```

## Exercise 2: Corpus Validation
```
=================================================
CORPUS VALIDATION RESULTS (ING-008):
Documents count: 32 (Required: >= 30) -> PASS
Pages count:     197 (Required: >= 150) -> PASS
PII Audit:       PASS (Clean Synthetic Data)
=================================================
ALL CORPUS VALIDATION CHECKS PASSED!
```

## Exercise 4: Low-Evidence Refusal Response
```json
{
  "status": "REFUSED",
  "refusalReason": "The existing corpus contains insufficient evidence to reliably answer this query without hallucination.",
  "citations": []
}
```

## Exercise 6: Golden Benchmark Evaluation Output
```
Evaluation Summary:
Total Cases Evaluated: 26 (Floor: >= 25)
Adversarial Cases:     6 (Floor: >= 5)
Pass Rate:             100%
Average Latency:       265ms
Total Cost:            $0.01170
```
