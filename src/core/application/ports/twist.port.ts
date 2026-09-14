/**
 * DOMAIN COPILOT - MANDATORY TWIST PORT (T1: Bilingual AR+EN / DEV-001)
 * Clean Architecture port interface for assigned Twist implementation.
 * Application and Domain layers depend solely on this port, never on infrastructure/SDKs.
 *
 * T1 Bilingual AR+EN requires:
 * - Arabic document ingestion and retrieval
 * - Cross-lingual queries (EN→AR, AR→EN)
 * - RTL rendering support
 * - Separate Arabic retrieval evaluation
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

export interface LanguageDetectionResult {
  detectedLanguage: "ar" | "en" | "mixed";
  arabicRatio: number;
  confidence: number;
  containsArabic: boolean;
  shouldRenderRTL: boolean;
}

export interface CrossLingualConfig {
  queryLanguage: "ar" | "en" | "mixed";
  searchLanguages: string[];
  ftsConfigs: Record<string, string>;
}

export interface ITwistPort {
  readonly twistId: string;
  readonly twistName: string;

  /** T1 Bilingual: Detect the language of input text (Arabic, English, or mixed). */
  detectLanguage(text: string): LanguageDetectionResult;

  /** T1 Bilingual: Get cross-lingual search configuration for a query. */
  getCrossLingualConfig(query: string): CrossLingualConfig;

  /** T1 Bilingual: Determine the appropriate FTS config for a given language. */
  getFTSConfig(language: string): string;

  /** T1 Bilingual: Check if text should be rendered RTL. */
  shouldRenderRTL(text: string): boolean;

  /** Safety: Risk guard evaluation (retained as bonus safety feature). */
  evaluateRiskGuard(input: TwistExecutionInput): TwistEvaluationResult;
}
