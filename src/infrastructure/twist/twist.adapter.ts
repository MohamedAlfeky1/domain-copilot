/**
 * DOMAIN COPILOT - MANDATORY TWIST IMPLEMENTATION ADAPTER (EPIC 06)
 * Encapsulates assigned Twist (T1: Deterministic Side-Effect Risk Guard)
 * Behind a clean boundary so business logic remains completely isolated.
 */

import { ACTIVE_VARIANT } from "../../config/variant.config";

export interface TwistExecutionInput {
  actionName: string;
  payload: Record<string, unknown>;
  evidenceScores: number[];
  requesterRole: string;
}

export interface TwistEvaluationResult {
  isPermitted: boolean;
  computedRiskIndex: number;
  threshold: number;
  enforcedPolicy: string;
  violations: string[];
}

export interface ITwistAdapter {
  readonly twistId: string;
  readonly twistName: string;
  evaluateRiskGuard(input: TwistExecutionInput): TwistEvaluationResult;
}

export class TwistRiskGuardAdapter implements ITwistAdapter {
  readonly twistId: string;
  readonly twistName: string;

  constructor() {
    this.twistId = ACTIVE_VARIANT.twistId;
    this.twistName = ACTIVE_VARIANT.twistName;
  }

  evaluateRiskGuard(input: TwistExecutionInput): TwistEvaluationResult {
    const violations: string[] = [];
    let riskIndex = 0.1;

    // Rule 1: High uncertainty check
    if (input.evidenceScores.length > 0) {
      const minScore = Math.min(...input.evidenceScores);
      if (minScore < 0.35) {
        riskIndex += 0.45;
        violations.push("Critical evidence source has confidence score below minimum safety floor (0.35).");
      }
    } else {
      riskIndex += 0.6;
      violations.push("Zero grounded evidence sources available for this consequential operation.");
    }

    // Rule 2: High consequence action check
    if (input.actionName.includes("update") || input.actionName.includes("execute") || input.actionName.includes("delete")) {
      riskIndex += 0.3;
    }

    const threshold = ACTIVE_VARIANT.riskThreshold; // Default 0.85
    const isPermitted = riskIndex < threshold && violations.length === 0;

    return {
      isPermitted,
      computedRiskIndex: Math.round(riskIndex * 100) / 100,
      threshold,
      enforcedPolicy: ACTIVE_VARIANT.domainRiskPolicy,
      violations,
    };
  }
}

export const twistAdapter = new TwistRiskGuardAdapter();
