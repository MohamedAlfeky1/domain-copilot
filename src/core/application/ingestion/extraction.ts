/**
 * Format extraction and deterministic cleaning contracts (ING-002).
 * These adapters deliberately return page/heading information so chunking can
 * retain citation metadata instead of treating documents as an opaque string.
 */
import path from "path";
import { inflateRawSync } from "zlib";
import { UnsupportedFileTypeError, ValidationError } from "../../domain/errors";

export interface ExtractedPage {
  number: number;
  text: string;
}

export interface ExtractionResult {
  text: string;
  pages: ExtractedPage[];
  detectedFormat: "PDF" | "DOCX" | "TEXT";
  extractionMethod?: "normal" | "ocr";
}

export interface CleaningResult {
  text: string;
  pages: ExtractedPage[];
  removedBoilerplateLines: number;
}

export interface IExtractor {
  supports(filename: string, mimeType: string): boolean;
  extract(buffer: Buffer): ExtractionResult | Promise<ExtractionResult>;
}

export interface ICleaner {
  clean(result: ExtractionResult): CleaningResult;
}

export class TextExtractor implements IExtractor {
  supports(filename: string, mimeType: string) {
    return mimeType === "text/plain" || /\.(txt|md)$/i.test(filename);
  }

  extract(buffer: Buffer): ExtractionResult {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    if (!text.trim()) throw new ValidationError("The text document contains no extractable text.");
    const pages = text.split(/\f|\n\s*---\s*PAGE\s+\d+\s*---\s*\n/i).map((page, index) => ({
      number: index + 1,
      text: page,
    }));
    return { text, pages, detectedFormat: "TEXT" };
  }
}

/** Minimal OOXML reader for the document.xml part of a DOCX archive. */
export class DocxExtractor implements IExtractor {
  supports(filename: string, mimeType: string) {
    return mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(filename);
  }

  extract(buffer: Buffer): ExtractionResult {
    const marker = Buffer.from("word/document.xml");
    const nameOffset = buffer.indexOf(marker);
    if (nameOffset < 30) throw new ValidationError("Invalid DOCX file: word/document.xml is missing.");
    const headerOffset = nameOffset - 30;
    const compression = buffer.readUInt16LE(headerOffset + 8);
    const compressedSize = buffer.readUInt32LE(headerOffset + 18);
    const fileNameLength = buffer.readUInt16LE(headerOffset + 26);
    const extraLength = buffer.readUInt16LE(headerOffset + 28);
    const dataStart = headerOffset + 30 + fileNameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const xml = (compression === 0 ? compressed : compression === 8 ? inflateRawSync(compressed) : null)?.toString("utf8");
    if (!xml) throw new ValidationError("DOCX uses an unsupported compression method.");
    const text = xml
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
    if (!text.trim()) throw new ValidationError("The DOCX document contains no extractable text.");
    return { text, pages: [{ number: 1, text }], detectedFormat: "DOCX" };
  }
}

/**
 * Standard PDF text extractor using Mozilla PDF.js (pdfjs-dist).
 * Handles font mapping, ToUnicode CMaps, multi-page layout, and Unicode (Arabic & English).
 * Scanned image-only PDFs correctly throw ValidationError requesting OCR.
 */
export class PdfExtractor implements IExtractor {
  supports(filename: string, mimeType: string) {
    return mimeType === "application/pdf" || /\.pdf$/i.test(filename);
  }

  async extract(buffer: Buffer): Promise<ExtractionResult> {
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new ValidationError("Invalid PDF signature.");
    }

    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const cMapUrl = path.join(process.cwd(), "node_modules/pdfjs-dist/cmaps/").replace(/\\/g, "/").replace(/\/?$/, "/");
      const standardFontDataUrl = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/").replace(/\\/g, "/").replace(/\/?$/, "/");

      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        cMapUrl,
        cMapPacked: true,
        standardFontDataUrl,
      });

      const doc = await loadingTask.promise;
      const numPages = doc.numPages;
      const pages: ExtractedPage[] = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();

        const lines: string[] = [];
        let currentLine = "";

        for (const item of textContent.items) {
          if ("str" in item) {
            currentLine += item.str;
            if (item.hasEOL) {
              lines.push(currentLine);
              currentLine = "";
            }
          }
        }
        if (currentLine.trim()) {
          lines.push(currentLine);
        }

        const pageText = lines.join("\n").replace(/[ \t]+/g, " ").trim();
        if (pageText) {
          pages.push({
            number: pageNum,
            text: pageText,
          });
        }
      }

      const text = pages.map((page) => page.text).join("\n\n").trim();
      if (!text) {
        throw new ValidationError("PDF has no embedded text. Upload an OCR-enabled PDF or add an OCR extractor.");
      }

      return { text, pages, detectedFormat: "PDF" };
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new ValidationError(`Failed to parse PDF document: ${message}`);
    }
  }
}

export class DeterministicCleaner implements ICleaner {
  clean(result: ExtractionResult): CleaningResult {
    const normalized = result.pages.map((page) => ({
      ...page,
      text: page.text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim(),
    }));
    const occurrences = new Map<string, number>();
    for (const page of normalized) {
      const unique = new Set(page.text.split("\n").map((line) => line.trim()).filter((line) => line.length >= 3 && line.length <= 120));
      unique.forEach((line) => occurrences.set(line, (occurrences.get(line) || 0) + 1));
    }
    const boilerplate = new Set([...occurrences].filter(([, count]) => count >= 2).map(([line]) => line));
    let removedBoilerplateLines = 0;
    const pages = normalized.map((page) => ({
      ...page,
      text: page.text.split("\n").filter((line) => {
        if (boilerplate.has(line.trim())) { removedBoilerplateLines++; return false; }
        return true;
      }).join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    }));
    const text = pages.map((page) => `--- PAGE ${page.number} ---\n${page.text}`).join("\n\n");
    return { text, pages, removedBoilerplateLines };
  }
}

export class ExtractorRegistry {
  private readonly extractors: IExtractor[];
  constructor(extractors: IExtractor[] = [new PdfExtractor(), new DocxExtractor(), new TextExtractor()]) {
    this.extractors = extractors;
  }

  async extract(filename: string, mimeType: string, buffer: Buffer): Promise<ExtractionResult> {
    const extractor = this.extractors.find((candidate) => candidate.supports(filename, mimeType));
    if (!extractor) throw new UnsupportedFileTypeError(`No extractor is registered for ${filename} (${mimeType}).`);
    return extractor.extract(buffer);
  }
}

