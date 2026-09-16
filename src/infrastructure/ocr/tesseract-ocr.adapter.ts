/**
 * DOMAIN COPILOT - TESSERACT OCR ADAPTER (ING-002 / Step 3)
 * Infrastructure Adapter implementing IOCRPort via Tesseract CLI.
 *
 * Capabilities:
 * - Bilingual Arabic (`ara`) and English (`eng`) OCR.
 * - Multi-page extraction with exact 1-based page boundary preservation (via form-feed `\f`).
 * - Completely isolated behind the IOCRPort port abstraction.
 * - Configurable via environment variables (no hardcoded machine paths).
 * - Safe mock/stub hooks for 100% deterministic testing in CI environments.
 */

import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { IOCRPort, OcrInput } from "../../core/application/ports/ocr.port";
import { ExtractionResult, ExtractedPage } from "../../core/application/ingestion/extraction";
import { ExtractionQualityError } from "../../core/domain/errors";

const execFileAsync = promisify(execFile);

export interface TesseractConfig {
  enabled: boolean;
  binaryPath: string;
  languages: string;
  timeoutMs: number;
}

export type OcrExecutor = (
  cmd: string,
  args: string[],
  options?: { timeout?: number }
) => Promise<{ stdout: string; stderr: string }>;

export class TesseractOcrAdapter implements IOCRPort {
  private readonly config: TesseractConfig;
  private customExecutor?: OcrExecutor;
  private availabilityCache?: boolean;

  constructor(
    config?: Partial<TesseractConfig>,
    customExecutor?: OcrExecutor
  ) {
    this.config = {
      enabled: config?.enabled ?? process.env.OCR_ENABLED === "true",
      binaryPath: config?.binaryPath || process.env.OCR_BINARY_PATH || "tesseract",
      languages: config?.languages || process.env.OCR_LANGUAGES || "ara+eng",
      timeoutMs: config?.timeoutMs ?? (Number(process.env.OCR_TIMEOUT_MS) || 60000),
    };
    this.customExecutor = customExecutor;
  }

  /**
   * Allows setting a custom executor for testing or custom runner pipelines.
   */
  setExecutor(executor: OcrExecutor | undefined): void {
    this.customExecutor = executor;
    this.availabilityCache = undefined;
  }

  /**
   * Checks if OCR is enabled and the underlying binary/executor is available.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config.enabled && !this.customExecutor) {
      return false;
    }

    if (this.customExecutor) {
      return true;
    }

    if (this.availabilityCache !== undefined) {
      return this.availabilityCache;
    }

    try {
      await execFileAsync(this.config.binaryPath, ["--version"], {
        timeout: 5000,
      });
      this.availabilityCache = true;
      return true;
    } catch {
      this.availabilityCache = false;
      return false;
    }
  }

  /**
   * Executes OCR on the provided PDF buffer and returns a page-aware ExtractionResult.
   */
  async extractText(input: OcrInput): Promise<ExtractionResult> {
    const available = await this.isAvailable();
    if (!available) {
      throw new ExtractionQualityError(
        "OCR fallback is not available or disabled in the current environment. Please configure OCR_ENABLED and verify OCR_BINARY_PATH."
      );
    }

    const languages = this.resolveLanguages(input.languageHint);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-"));
    const inputPdfPath = path.join(tempDir, "input.pdf");
    const outputBasePath = path.join(tempDir, "output");
    const outputTxtPath = `${outputBasePath}.txt`;

    try {
      fs.writeFileSync(inputPdfPath, input.buffer);

      const args = [inputPdfPath, outputBasePath, "-l", languages];

      if (this.customExecutor) {
        await this.customExecutor(this.config.binaryPath, args, {
          timeout: this.config.timeoutMs,
        });
      } else {
        await execFileAsync(this.config.binaryPath, args, {
          timeout: this.config.timeoutMs,
        });
      }

      let rawOutput = "";
      if (fs.existsSync(outputTxtPath)) {
        rawOutput = fs.readFileSync(outputTxtPath, "utf8");
      }

      const pages = this.parsePages(rawOutput);
      const combinedText = pages.map((p) => p.text).join("\n\n").trim();

      return {
        text: combinedText,
        pages,
        detectedFormat: "PDF",
      };
    } catch (err: unknown) {
      if (err instanceof ExtractionQualityError) throw err;
      const message = err instanceof Error ? err.message : "Unknown error during OCR execution";
      throw new ExtractionQualityError(`Tesseract OCR execution failed: ${message}`);
    } finally {
      try {
        if (fs.existsSync(inputPdfPath)) fs.unlinkSync(inputPdfPath);
        if (fs.existsSync(outputTxtPath)) fs.unlinkSync(outputTxtPath);
        if (fs.existsSync(tempDir)) {
          if (fs.rmSync) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } else {
            fs.rmdirSync(tempDir, { recursive: true });
          }
        }
      } catch {
        // Best-effort temp cleanup
      }
    }
  }

  /**
   * Resolves language code flags based on language hints and default config.
   * Supports bilingual Arabic + English seamlessly (`ara+eng`).
   */
  private resolveLanguages(languageHint?: "ar" | "en" | "bilingual" | "unknown"): string {
    if (languageHint === "ar") {
      return "ara+eng";
    }
    if (languageHint === "en") {
      return "eng+ara";
    }
    return this.config.languages;
  }

  /**
   * Splits Tesseract output by the standard form-feed character `\f` to preserve
   * 1-based source page boundaries.
   */
  private parsePages(rawText: string): ExtractedPage[] {
    const rawPages = rawText.split("\f");
    // Trailing form-feed produces empty last element
    if (rawPages.length > 1 && rawPages[rawPages.length - 1].trim() === "") {
      rawPages.pop();
    }

    if (rawPages.length === 0 || (rawPages.length === 1 && rawPages[0].trim() === "")) {
      return [];
    }

    return rawPages.map((pageText, index) => ({
      number: index + 1,
      text: pageText.trim(),
    }));
  }
}
