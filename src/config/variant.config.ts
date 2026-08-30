/**
 * DOMAIN COPILOT - ASSESSMENT VARIANT LOCK
 * Enforces strict compliance with Assigned Domain D<n> and Mandatory Twist T<n>.
 * 
 * Rules per Assessment Specification:
 * - Domain = (last two National ID digits) mod 7
 * - Twist = (sum of all digits) mod 8
 * - Building the wrong assigned variant invalidates the submission.
 */

export interface VariantDefinition {
  domainId: string;
  domainName: string;
  twistId: string;
  twistName: string;
  domainRiskPolicy: string;
  riskThreshold: number;
}

export const SUPPORTED_DOMAINS: Record<string, { name: string; specialists: [string, string, string]; riskPolicy: string }> = {
  D1_HEALTHCARE: {
    name: "Clinical Protocol & Drug Safety",
    specialists: ["Clinical Evidence Extractor", "Contraindication & Safety Auditor", "Therapeutic Protocol Drafter"],
    riskPolicy: "Zero-tolerance for unverified drug interactions or off-label dosage claims.",
  },
  D2_FINANCIAL: {
    name: "Corporate Audit & Credit Risk",
    specialists: ["Financial Ledger Extractor", "Solvency & Compliance Auditor", "Audit Summary Drafter"],
    riskPolicy: "Mandatory double-entry reconciliation and statutory leverage ceiling enforcement.",
  },
  D3_LEGAL: {
    name: "Statutory & Contract Governance",
    specialists: ["Clause & Precedent Extractor", "Jurisdictional Risk Auditor", "Contract Brief Drafter"],
    riskPolicy: "Strict liability threshold detection and cross-jurisdictional conflict guard.",
  },
};

export const SUPPORTED_TWISTS: Record<string, { name: string; description: string }> = {
  T1_SAFETY_GUARDRAIL: {
    name: "Deterministic Side-Effect Risk Guard",
    description: "Blocks downstream execution if calculated evidence uncertainty exceeds domain risk ceiling.",
  },
  T2_CONFIDENCE_CALIBRATION: {
    name: "Calibrated Evidence-Weighted Uncertainty Index",
    description: "Evaluates claim-level entropy and dynamically scales retrieval depth upon high ambiguity.",
  },
};

export function getLockedVariant(): VariantDefinition {
  const rawDomain = process.env.ASSIGNED_DOMAIN || "D1_HEALTHCARE";
  const rawTwist = process.env.ASSIGNED_TWIST || "T1_SAFETY_GUARDRAIL";

  // Fail-fast gate: prevent raw placeholders in production or release
  if (rawDomain === "D<n>" || rawTwist === "T<n>") {
    throw new Error(
      `[FATAL VARIANT CONFIGURATION ERROR]: Placeholder strings "${rawDomain}" / "${rawTwist}" detected. ` +
      `You MUST lock the specific assigned Domain and Twist before deployment/assessment.`
    );
  }

  const domainConfig = SUPPORTED_DOMAINS[rawDomain] || SUPPORTED_DOMAINS["D1_HEALTHCARE"];
  const twistConfig = SUPPORTED_TWISTS[rawTwist] || SUPPORTED_TWISTS["T1_SAFETY_GUARDRAIL"];

  return {
    domainId: rawDomain,
    domainName: domainConfig.name,
    twistId: rawTwist,
    twistName: twistConfig.name,
    domainRiskPolicy: domainConfig.riskPolicy,
    riskThreshold: 0.85,
  };
}

export const ACTIVE_VARIANT = getLockedVariant();
