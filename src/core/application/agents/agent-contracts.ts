/**
 * DOMAIN COPILOT - TYPED AGENT CONTRACTS (AGT-001)
 * Formal schemas using Zod for agent requests, responses, and state machine transitions.
 */

import { z } from "zod";

export const ExtractorOutputSchema = z.object({
  extractedFacts: z.array(
    z.object({
      statement: z.string(),
      chunkId: z.string(),
      confidence: z.number().min(0).max(1),
    })
  ),
  relevantSections: z.array(z.string()),
  dataCompleteness: z.enum(["HIGH", "MODERATE", "INSUFFICIENT"]),
});

export type ExtractorOutput = z.infer<typeof ExtractorOutputSchema>;

export const AuditorOutputSchema = z.object({
  verifiedFacts: z.array(z.string()),
  riskFlags: z.array(
    z.object({
      riskType: z.string(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      detail: z.string(),
    })
  ),
  domainComplianceApproved: z.boolean(),
  requiresHumanReview: z.boolean(),
  proposedAction: z.string().optional(),
});

export type AuditorOutput = z.infer<typeof AuditorOutputSchema>;

export const DrafterOutputSchema = z.object({
  synthesis: z.string(),
  citationsUsed: z.array(z.string()),
  refusalNotice: z.string().optional(),
  actionProposed: z.object({
    toolName: z.string(),
    parameters: z.record(z.unknown()),
    isSideEffecting: z.boolean(),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  }).optional(),
});

export type DrafterOutput = z.infer<typeof DrafterOutputSchema>;
