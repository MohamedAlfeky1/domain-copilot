/**
 * DOMAIN COPILOT - OCR PORT INTERFACE (ING-002 / Architecture Migration Step 3)
 * Clean Architecture Port for optical character recognition fallback.
 * Allows decoupling the ingestion pipeline from any specific OCR engine or CLI.
 */

import { ExtractionResult } from "../ingestion/extraction";

export interface OcrInput {
  filename: string;
  buffer: Buffer;
  languageHint?: "ar" | "en" | "bilingual" | "unknown";
}

export interface IOCRPort {
  /**
   * Returns true if the OCR engine is enabled and available in the current environment.
   */
  isAvailable(): Promise<boolean> | boolean;

  /**
   * Extracts text from an image or scanned document buffer in a page-aware manner.
   * Returns an ExtractionResult preserving page numbers and text.
   */
  extractText(input: OcrInput): Promise<ExtractionResult>;
}
