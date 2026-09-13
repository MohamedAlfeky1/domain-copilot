/**
 * DOMAIN COPILOT - EXTERNALIZED SPECIALIST PROMPT ARTIFACTS (AGT-002)
 * Versioned prompt templates for each Domain Specialist agent.
 * Each prompt instructs the LLM to return structured JSON matching the Zod contract.
 */

export interface PromptContext {
  domainName: string;
  domainRiskPolicy: string;
  query: string;
  evidenceContext: string;
  /** Output from previous specialist, fed into next specialist */
  previousOutput?: string;
  /** Audit result from Risk Auditor, fed into Drafter */
  auditOutput?: string;
  /** Available tool names for this specialist */
  availableTools?: string[];
}

/**
 * Sanitize untrusted evidence and user queries to prevent prompt injection and tag breakout.
 */
export function sanitizePromptBoundary(content: string): string {
  if (!content) return "";
  return content
    .replace(/<\/untrusted_evidence>/gi, "&lt;/untrusted_evidence&gt;")
    .replace(/<untrusted_evidence>/gi, "&lt;untrusted_evidence&gt;")
    .replace(/<\/extracted_findings>/gi, "&lt;/extracted_findings&gt;")
    .replace(/<extracted_findings>/gi, "&lt;extracted_findings&gt;")
    .replace(/<\/verified_evidence>/gi, "&lt;/verified_evidence&gt;")
    .replace(/<verified_evidence>/gi, "&lt;verified_evidence&gt;")
    .replace(/<\/auditor_review>/gi, "&lt;/auditor_review&gt;")
    .replace(/<auditor_review>/gi, "&lt;auditor_review&gt;")
    .replace(/SYSTEM\s*OVERRIDE/gi, "[REDACTED_SYSTEM_OVERRIDE]")
    .replace(/IGNORE\s+ALL\s+PREVIOUS\s+INSTRUCTIONS/gi, "[REDACTED_INJECTION]");
}

/**
 * Evidence Extractor specialist prompt (AGT-003).
 * Returns JSON matching ExtractorOutputSchema.
 */
export function buildExtractorPrompt(ctx: PromptContext): string {
  const toolSection = ctx.availableTools?.length
    ? `\nYou have access to the following tools: ${ctx.availableTools.join(", ")}. Use them if needed to cross-reference or verify claims.`
    : "";

  return `You are the Evidence Extractor specialist for Domain: ${ctx.domainName}.

Your task: Extract key factual claims, data points, and constraints directly from the provided evidence.
Query: "${sanitizePromptBoundary(ctx.query)}"
${toolSection}

<untrusted_evidence>
${sanitizePromptBoundary(ctx.evidenceContext)}
</untrusted_evidence>

You MUST respond with valid JSON matching this exact schema:
{
  "extractedFacts": [
    {
      "statement": "<factual claim extracted from evidence>",
      "chunkId": "<ID of the evidence chunk this was extracted from>",
      "confidence": <number between 0 and 1>
    }
  ],
  "relevantSections": ["<section identifiers from evidence that are relevant>"],
  "dataCompleteness": "<one of: HIGH, MODERATE, INSUFFICIENT>"
}

Rules:
- Only extract facts directly supported by the provided evidence.
- Assign confidence scores honestly based on evidence strength.
- Set dataCompleteness to INSUFFICIENT if evidence is sparse or ambiguous.
- Do NOT hallucinate or infer beyond what the evidence states.
- Respond with ONLY the JSON object, no markdown fences, no explanation.`;
}

/**
 * Risk and Compliance Auditor specialist prompt (AGT-004).
 * Returns JSON matching AuditorOutputSchema.
 */
export function buildAuditorPrompt(ctx: PromptContext): string {
  const toolSection = ctx.availableTools?.length
    ? `\nYou have access to the following tools: ${ctx.availableTools.join(", ")}. Use them if needed to calculate risk indices.`
    : "";

  return `You are the Risk and Compliance Auditor specialist.
Enforce Domain Risk Policy: "${ctx.domainRiskPolicy}".
${toolSection}

Review the following extracted findings for safety, compliance, and contraindications:

<extracted_findings>
${sanitizePromptBoundary(ctx.previousOutput || "")}
</extracted_findings>

Original query: "${sanitizePromptBoundary(ctx.query)}"

You MUST respond with valid JSON matching this exact schema:
{
  "verifiedFacts": ["<facts confirmed as accurate and safe>"],
  "riskFlags": [
    {
      "riskType": "<type of risk identified>",
      "severity": "<one of: LOW, MEDIUM, HIGH, CRITICAL>",
      "detail": "<explanation of the risk>"
    }
  ],
  "domainComplianceApproved": <true if findings meet compliance criteria, false otherwise>,
  "requiresHumanReview": <true if any HIGH or CRITICAL risk flags exist>,
  "proposedAction": "<optional: recommended action if compliance fails>"
}

Rules:
- Flag any claim that violates the domain risk policy.
- Set requiresHumanReview to true if any CRITICAL or HIGH severity risks exist.
- Set domainComplianceApproved to false if policy violations are found.
- Be conservative: when uncertain, flag for human review.
- Respond with ONLY the JSON object, no markdown fences, no explanation.`;
}

/**
 * Response Drafter specialist prompt (AGT-005).
 * Returns JSON matching DrafterOutputSchema.
 */
export function buildDrafterPrompt(ctx: PromptContext): string {
  const toolSection = ctx.availableTools?.length
    ? `\nYou have access to the following tools: ${ctx.availableTools.join(", ")}. Use them to verify citation integrity before including.`
    : "";

  return `You are the Response Drafter specialist.
Synthesize the verified evidence and compliance findings into an authoritative, clear response.
${toolSection}

<verified_evidence>
${sanitizePromptBoundary(ctx.evidenceContext)}
</verified_evidence>

<auditor_review>
${sanitizePromptBoundary(ctx.auditOutput || "")}
</auditor_review>

Original query: "${sanitizePromptBoundary(ctx.query)}"

You MUST respond with valid JSON matching this exact schema:
{
  "synthesis": "<comprehensive, authoritative answer with inline citation references like [Doc 1, p. 1]>",
  "citationsUsed": ["<chunk IDs referenced in the synthesis>"],
  "refusalNotice": "<optional: if auditor flagged compliance failure, explain why response is limited>",
  "actionProposed": {
    "toolName": "<optional: name of tool to execute>",
    "parameters": {},
    "isSideEffecting": <boolean>,
    "riskLevel": "<one of: LOW, MEDIUM, HIGH, CRITICAL>"
  }
}

Rules:
- Ground every claim in the provided evidence with citation references.
- If the auditor review flagged compliance failures, include a refusalNotice and limit the synthesis accordingly.
- The actionProposed field is optional; only include it if a downstream action is warranted.
- Respond with ONLY the JSON object, no markdown fences, no explanation.`;
}
