/**
 * DOMAIN COPILOT - TYPED AGENT CONTRACTS (AGT-001)
 * Formal schemas using Zod for agent requests, responses, and state machine transitions.
 */

import { z, ZodSchema } from "zod";
import { ValidationError } from "../../domain/errors";

/**
 * Extract JSON from LLM text, handling optional markdown code fences.
 */
function extractJsonString(raw: string): string {
  const trimmed = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` fences
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Try to find first { ... } block
  const braceStart = trimmed.indexOf("{");
  const braceEnd = trimmed.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return trimmed.slice(braceStart, braceEnd + 1);
  }

  return trimmed;
}

/**
 * Parse and validate raw LLM text output against a Zod schema.
 * Throws ValidationError with details if parsing or validation fails.
 */
export function parseAgentOutput<T>(schema: ZodSchema<T>, raw: string, agentName: string): T {
  const jsonStr = extractJsonString(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new ValidationError(
      `${agentName} returned invalid JSON. Raw output (first 500 chars): "${raw.slice(0, 500)}"`
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ValidationError(
      `${agentName} output failed schema validation: ${issues}`
    );
  }

  return result.data;
}

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
