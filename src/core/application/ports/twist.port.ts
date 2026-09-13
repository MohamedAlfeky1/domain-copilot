/**
 * DOMAIN COPILOT - MANDATORY TWIST PORT (TW-004 / DEV-001)
 * Clean Architecture port interface for assigned Twist implementation.
 * Application and Domain layers depend solely on this port, never on infrastructure/SDKs.
 */

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

export interface ITwistPort {
  readonly twistId: string;
  readonly twistName: string;
  evaluateRiskGuard(input: TwistExecutionInput): TwistEvaluationResult;
}
