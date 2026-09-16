/**
 * PDF EXTRACTION QUALITY GATE (ING-002 / Architecture Migration Step 2)
 *
 * Evaluates the usability of extracted PDF text BEFORE cleaning and chunking.
 * Detects extraction failures including:
 * - extremely low text density / near-empty pages
 * - excessive Unicode replacement characters (e.g. \uFFFD / )
 * - suspicious control character ratios
 * - severe mojibake / corrupted encoding patterns
 * - very low valid word/character ratios
 *
 * Fully supports and preserves:
 * - English text
 * - Arabic Unicode text (letters, Arabic-Indic digits, Arabic punctuation)
 * - Bilingual Arabic + English text
 * - Standard typographic, mathematical, scientific, and document symbols
 */

import { ExtractionQualityError } from "../../domain/errors";
import { ExtractionResult, ExtractedPage } from "./extraction";

export interface QualityGateConfig {
  /** Minimum characters required across the entire document. Default: 30 */
  minTotalChars: number;
  /** Minimum average characters per page. Default: 20 */
  minAvgCharsPerPage: number;
  /** Minimum characters on a single page to be considered non-empty. Default: 5 */
  minPageChars: number;
  /** Maximum tolerable ratio of Unicode replacement characters (\uFFFD / ). Default: 0.03 (3%) */
  maxReplacementCharRatio: number;
  /** Absolute count of replacement characters that triggers rejection. Default: 5 */
  maxReplacementCharCount: number;
  /** Maximum tolerable ratio of suspicious control characters. Default: 0.02 (2%) */
  maxControlCharRatio: number;
  /** Minimum ratio of valid characters (letters, digits, punctuation, common symbols, whitespace). Default: 0.85 (85%) */
  minValidCharRatio: number;
  /** Minimum ratio of recognizable words (tokens containing letters or digits). Default: 0.50 (50%) */
  minWordValidityRatio: number;
  /** Minimum composite quality score (0.0 - 1.0) required for document usability. Default: 0.70 */
  minCompositeScore: number;
}

export const DEFAULT_QUALITY_GATE_CONFIG: QualityGateConfig = {
  minTotalChars: 30,
  minAvgCharsPerPage: 20,
  minPageChars: 5,
  maxReplacementCharRatio: 0.03,
  maxReplacementCharCount: 5,
  maxControlCharRatio: 0.02,
  minValidCharRatio: 0.85,
  minWordValidityRatio: 0.50,
  minCompositeScore: 0.70,
};

export interface PageQualityMetrics {
  pageNumber: number;
  charCount: number;
  wordCount: number;
  arabicCharCount: number;
  latinCharCount: number;
  digitCount: number;
  replacementCharCount: number;
  controlCharCount: number;
  validCharRatio: number;
  replacementCharRatio: number;
  controlCharRatio: number;
  wordValidityRatio: number;
  isUsable: boolean;
  issues: string[];
}

export interface DocumentQualityReport {
  usable: boolean;
  score: number;
  detectedLanguage: "ar" | "en" | "bilingual" | "unknown";
  totalPages: number;
  usablePages: number;
  totalChars: number;
  totalWords: number;
  metrics: {
    avgCharsPerPage: number;
    overallValidCharRatio: number;
    overallReplacementCharRatio: number;
    overallControlCharRatio: number;
    overallWordValidityRatio: number;
  };
  reasons: string[];
  pageReports: PageQualityMetrics[];
}

// Unicode script matching
const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_SCRIPT_REGEX = /[a-zA-Z]/;
const DIGIT_REGEX = /[0-9\u0660-\u0669\u06F0-\u06F9]/;
const REPLACEMENT_CHAR_REGEX = /\uFFFD/;
const SUSPICIOUS_CONTROL_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

// Valid punctuation, symbols, brackets, currencies, mathematical operators, and typographic marks
const VALID_SYMBOLS_REGEX = /[\s.,;:!?'"()[\]{}<>\/\\-_+=*&%$#@~^|`\u2018\u2019\u201C\u201D\u2013\u2014\u2022\u2023\u25E6\u2026±×÷°µ≤≥≠≈€$£¥©®™✓✔✗✘→←،؛؟ـ«»]/;

export class PdfQualityGate {
  private readonly config: QualityGateConfig;

  constructor(config: Partial<QualityGateConfig> = {}) {
    this.config = { ...DEFAULT_QUALITY_GATE_CONFIG, ...config };
  }

  /**
   * Evaluates an ExtractionResult and returns a structured quality report.
   * Safe for logging: contains metrics, counts, and reasons without exposing raw text secrets.
   */
  evaluate(result: ExtractionResult): DocumentQualityReport {
    const pages = result.pages || [];
    const totalPages = pages.length;

    if (totalPages === 0) {
      return {
        usable: false,
        score: 0,
        detectedLanguage: "unknown",
        totalPages: 0,
        usablePages: 0,
        totalChars: 0,
        totalWords: 0,
        metrics: {
          avgCharsPerPage: 0,
          overallValidCharRatio: 0,
          overallReplacementCharRatio: 0,
          overallControlCharRatio: 0,
          overallWordValidityRatio: 0,
        },
        reasons: ["Document contains no extracted pages."],
        pageReports: [],
      };
    }

    const pageReports: PageQualityMetrics[] = pages.map((page) => this.evaluatePage(page));

    let totalChars = 0;
    let totalWords = 0;
    let totalArabicChars = 0;
    let totalLatinChars = 0;
    let totalReplacementChars = 0;
    let totalControlChars = 0;
    let totalValidChars = 0;
    let totalValidWords = 0;

    for (const p of pageReports) {
      totalChars += p.charCount;
      totalWords += p.wordCount;
      totalArabicChars += p.arabicCharCount;
      totalLatinChars += p.latinCharCount;
      totalReplacementChars += p.replacementCharCount;
      totalControlChars += p.controlCharCount;
      totalValidChars += Math.round(p.validCharRatio * p.charCount);
      totalValidWords += Math.round(p.wordValidityRatio * p.wordCount);
    }

    const avgCharsPerPage = totalPages > 0 ? totalChars / totalPages : 0;
    const overallValidCharRatio = totalChars > 0 ? totalValidChars / totalChars : 0;
    const overallReplacementCharRatio = totalChars > 0 ? totalReplacementChars / totalChars : 0;
    const overallControlCharRatio = totalChars > 0 ? totalControlChars / totalChars : 0;
    const overallWordValidityRatio = totalWords > 0 ? totalValidWords / totalWords : 0;

    // Detect language safely from post-extraction character distribution
    const totalAlpha = totalArabicChars + totalLatinChars;
    let detectedLanguage: "ar" | "en" | "bilingual" | "unknown" = "unknown";
    if (totalAlpha > 0) {
      const arabicFraction = totalArabicChars / totalAlpha;
      const latinFraction = totalLatinChars / totalAlpha;
      if (arabicFraction >= 0.15 && latinFraction >= 0.15) {
        detectedLanguage = "bilingual";
      } else if (arabicFraction >= 0.50) {
        detectedLanguage = "ar";
      } else {
        detectedLanguage = "en";
      }
    }

    const usablePages = pageReports.filter((p) => p.isUsable).length;
    const usablePagesRatio = totalPages > 0 ? usablePages / totalPages : 0;

    // Composite quality score between 0.0 and 1.0
    const score = Math.max(
      0,
      Math.min(
        1,
        0.40 * overallValidCharRatio +
        0.30 * overallWordValidityRatio +
        0.15 * Math.max(0, 1 - overallReplacementCharRatio * 10) +
        0.10 * Math.max(0, 1 - overallControlCharRatio * 10) +
        0.05 * usablePagesRatio
      )
    );

    const reasons: string[] = [];

    if (totalChars < this.config.minTotalChars) {
      reasons.push(
        `Total extracted text density is extremely low (${totalChars} characters, minimum is ${this.config.minTotalChars}).`
      );
    }

    if (avgCharsPerPage < this.config.minAvgCharsPerPage) {
      reasons.push(
        `Average text density per page is too low (${avgCharsPerPage.toFixed(1)} chars/page, minimum is ${this.config.minAvgCharsPerPage}).`
      );
    }

    if (
      overallReplacementCharRatio > this.config.maxReplacementCharRatio ||
      totalReplacementChars > this.config.maxReplacementCharCount
    ) {
      reasons.push(
        `Excessive Unicode replacement characters detected (${totalReplacementChars} characters, ${(overallReplacementCharRatio * 100).toFixed(1)}%).`
      );
    }

    if (overallControlCharRatio > this.config.maxControlCharRatio) {
      reasons.push(
        `Excessive control characters detected (${(overallControlCharRatio * 100).toFixed(1)}%).`
      );
    }

    if (overallValidCharRatio < this.config.minValidCharRatio) {
      reasons.push(
        `Low valid character ratio (${(overallValidCharRatio * 100).toFixed(1)}% valid, minimum is ${(this.config.minValidCharRatio * 100).toFixed(1)}%).`
      );
    }

    const failedPages = pageReports.filter((p) => !p.isUsable);
    if (failedPages.length > 0) {
      const pageDetails = failedPages
        .map((p) => `page ${p.pageNumber}: ${p.issues.join(", ")}`)
        .join("; ");
      reasons.push(`Unusable pages detected (${failedPages.length}/${totalPages} pages): ${pageDetails}`);
    }

    if (score < this.config.minCompositeScore) {
      reasons.push(
        `Composite quality score ${score.toFixed(2)} is below minimum threshold ${this.config.minCompositeScore.toFixed(2)}.`
      );
    }

    const usable = reasons.length === 0;

    return {
      usable,
      score: Number(score.toFixed(2)),
      detectedLanguage,
      totalPages,
      usablePages,
      totalChars,
      totalWords,
      metrics: {
        avgCharsPerPage: Number(avgCharsPerPage.toFixed(1)),
        overallValidCharRatio: Number(overallValidCharRatio.toFixed(3)),
        overallReplacementCharRatio: Number(overallReplacementCharRatio.toFixed(4)),
        overallControlCharRatio: Number(overallControlCharRatio.toFixed(4)),
        overallWordValidityRatio: Number(overallWordValidityRatio.toFixed(3)),
      },
      reasons,
      pageReports,
    };
  }

  /**
   * Asserts that the extraction result is usable for downstream chunking.
   * Throws an actionable ExtractionQualityError if quality checks fail.
   */
  assertUsable(result: ExtractionResult): DocumentQualityReport {
    const report = this.evaluate(result);
    if (!report.usable) {
      const reasonSummary = report.reasons.join(" ");
      throw new ExtractionQualityError(
        `PDF extraction quality check failed (score: ${report.score.toFixed(2)}). ${reasonSummary} Upload an OCR-enabled PDF or add an OCR extractor.`
      );
    }
    return report;
  }

  private evaluatePage(page: ExtractedPage): PageQualityMetrics {
    const text = page.text || "";
    const charCount = text.length;

    let arabicCharCount = 0;
    let latinCharCount = 0;
    let digitCount = 0;
    let replacementCharCount = 0;
    let controlCharCount = 0;
    let validSymbolCount = 0;

    for (const ch of text) {
      if (REPLACEMENT_CHAR_REGEX.test(ch)) {
        replacementCharCount++;
      } else if (SUSPICIOUS_CONTROL_REGEX.test(ch)) {
        controlCharCount++;
      } else if (ARABIC_SCRIPT_REGEX.test(ch)) {
        arabicCharCount++;
      } else if (LATIN_SCRIPT_REGEX.test(ch)) {
        latinCharCount++;
      } else if (DIGIT_REGEX.test(ch)) {
        digitCount++;
      } else if (VALID_SYMBOLS_REGEX.test(ch)) {
        validSymbolCount++;
      }
    }

    const validCharTotal = arabicCharCount + latinCharCount + digitCount + validSymbolCount;
    const validCharRatio = charCount > 0 ? validCharTotal / charCount : 0;
    const replacementCharRatio = charCount > 0 ? replacementCharCount / charCount : 0;
    const controlCharRatio = charCount > 0 ? controlCharCount / charCount : 0;

    // Word analysis
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    const wordCount = tokens.length;
    let validWords = 0;

    for (const token of tokens) {
      const hasAlphaNum =
        ARABIC_SCRIPT_REGEX.test(token) ||
        LATIN_SCRIPT_REGEX.test(token) ||
        DIGIT_REGEX.test(token);
      if (hasAlphaNum && !REPLACEMENT_CHAR_REGEX.test(token)) {
        validWords++;
      }
    }

    const wordValidityRatio = wordCount > 0 ? validWords / wordCount : 0;

    const issues: string[] = [];

    if (charCount < this.config.minPageChars) {
      issues.push(`insufficient text density (${charCount} chars)`);
    }

    if (
      replacementCharRatio > this.config.maxReplacementCharRatio ||
      replacementCharCount > this.config.maxReplacementCharCount
    ) {
      issues.push(
        `excessive replacement characters (${replacementCharCount} chars, ${(replacementCharRatio * 100).toFixed(1)}%)`
      );
    }

    if (controlCharRatio > this.config.maxControlCharRatio) {
      issues.push(`excessive control characters (${(controlCharRatio * 100).toFixed(1)}%)`);
    }

    if (validCharRatio < this.config.minValidCharRatio) {
      issues.push(
        `low valid character ratio (${(validCharRatio * 100).toFixed(1)}%)`
      );
    }

    if (wordCount > 0 && wordValidityRatio < this.config.minWordValidityRatio) {
      issues.push(`low word validity ratio (${(wordValidityRatio * 100).toFixed(1)}%)`);
    }

    const isUsable = issues.length === 0;

    return {
      pageNumber: page.number,
      charCount,
      wordCount,
      arabicCharCount,
      latinCharCount,
      digitCount,
      replacementCharCount,
      controlCharCount,
      validCharRatio: Number(validCharRatio.toFixed(3)),
      replacementCharRatio: Number(replacementCharRatio.toFixed(4)),
      controlCharRatio: Number(controlCharRatio.toFixed(4)),
      wordValidityRatio: Number(wordValidityRatio.toFixed(3)),
      isUsable,
      issues,
    };
  }
}
