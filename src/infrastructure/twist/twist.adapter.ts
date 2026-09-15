/**
 * DOMAIN COPILOT - MANDATORY TWIST IMPLEMENTATION ADAPTER
 * T1: Bilingual Arabic + English
 *
 * Implements cross-lingual capabilities:
 * - Arabic/English language detection via Unicode range analysis
 * - Cross-lingual query configuration for hybrid retrieval
 * - RTL rendering detection
 * - FTS config selection (english vs simple for Arabic)
 *
 * The Risk Guard logic is retained as an internal safety feature
 * but is NOT the mandatory twist — T1 Bilingual is.
 */

import { ACTIVE_VARIANT } from "../../config/variant.config";
import {
  ITwistPort,
  TwistExecutionInput,
  TwistEvaluationResult,
  LanguageDetectionResult,
  CrossLingualConfig,
} from "../../core/application/ports/twist.port";

export type { TwistExecutionInput, TwistEvaluationResult, LanguageDetectionResult, CrossLingualConfig };
export type ITwistAdapter = ITwistPort;

/**
 * Arabic Unicode ranges:
 * - \u0600-\u06FF: Arabic
 * - \u0750-\u077F: Arabic Supplement
 * - \u08A0-\u08FF: Arabic Extended-A
 * - \uFB50-\uFDFF: Arabic Presentation Forms-A
 * - \uFE70-\uFEFF: Arabic Presentation Forms-B
 */
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

export class BilingualTwistAdapter implements ITwistPort {
  readonly twistId: string;
  readonly twistName: string;

  constructor() {
    this.twistId = ACTIVE_VARIANT.twistId;
    this.twistName = ACTIVE_VARIANT.twistName;
  }

  /**
   * T1-CORE: Detect whether text is Arabic, English, or mixed.
   * Uses Unicode character frequency analysis.
   */
  detectLanguage(text: string): LanguageDetectionResult {
    if (!text || text.trim().length === 0) {
      return {
        detectedLanguage: "en",
        arabicRatio: 0,
        confidence: 1.0,
        containsArabic: false,
        shouldRenderRTL: false,
      };
    }

    // Count Arabic characters vs total alphabetic characters
    const arabicMatches = text.match(ARABIC_CHAR_REGEX) || [];
    const arabicCount = arabicMatches.length;
    // Count all alphabetic characters (Latin + Arabic)
    const latinMatches = text.match(/[a-zA-Z]/g) || [];
    const latinCount = latinMatches.length;
    const totalAlpha = arabicCount + latinCount;

    if (totalAlpha === 0) {
      return {
        detectedLanguage: "en",
        arabicRatio: 0,
        confidence: 0.5,
        containsArabic: false,
        shouldRenderRTL: false,
      };
    }

    const arabicRatio = arabicCount / totalAlpha;

    let detectedLanguage: "ar" | "en" | "mixed";
    let confidence: number;

    if (arabicRatio >= 0.7) {
      detectedLanguage = "ar";
      confidence = Math.min(1.0, 0.5 + arabicRatio);
    } else if (arabicRatio <= 0.3) {
      detectedLanguage = "en";
      confidence = Math.min(1.0, 0.5 + (1 - arabicRatio));
    } else {
      detectedLanguage = "mixed";
      confidence = 0.6;
    }

    return {
      detectedLanguage,
      arabicRatio: Math.round(arabicRatio * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      containsArabic: arabicCount > 0,
      shouldRenderRTL: arabicRatio >= 0.5,
    };
  }

  /**
   * T1-CORE: Get cross-lingual search configuration.
   * Both EN and AR corpora are always searched for cross-lingual retrieval.
   * Dense search (embedding) works cross-lingually via text-embedding-3-small.
   * Keyword search uses language-appropriate FTS config.
   */
  getCrossLingualConfig(query: string): CrossLingualConfig {
    const detection = this.detectLanguage(query);

    return {
      queryLanguage: detection.detectedLanguage,
      // Always search both languages for cross-lingual retrieval
      searchLanguages: ["en", "ar"],
      ftsConfigs: {
        en: "english",
        ar: "simple", // PostgreSQL doesn't ship an Arabic stemmer; 'simple' tokenizes correctly
      },
    };
  }

  /**
   * T1-CORE: Get the PostgreSQL FTS configuration for a given language.
   */
  getFTSConfig(language: string): string {
    if (language === "ar" || language === "arabic") {
      return "simple";
    }
    return "english";
  }

  /**
   * T1-CORE: Check if text should be rendered RTL.
   */
  shouldRenderRTL(text: string): boolean {
    return this.detectLanguage(text).shouldRenderRTL;
  }

  /**
   * BONUS SAFETY: Deterministic Side-Effect Risk Guard.
   * This is retained as an internal safety mechanism but is NOT the mandatory twist.
   * The mandatory twist is T1 Bilingual AR+EN.
   */
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

export const twistAdapter = new BilingualTwistAdapter();
