/**
 * Format extraction and deterministic cleaning contracts (ING-002).
 * These adapters deliberately return page/heading information so chunking can
 * retain citation metadata instead of treating documents as an opaque string.
 */
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
}

export interface CleaningResult {
  text: string;
  pages: ExtractedPage[];
  removedBoilerplateLines: number;
}

export interface IExtractor {
  supports(filename: string, mimeType: string): boolean;
  extract(buffer: Buffer): ExtractionResult;
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
 * Extracts text-show operators from text PDFs. Scanned PDFs correctly fail
 * with an actionable error because they require an OCR adapter, rather than
 * being silently indexed as binary data.
 */
export class PdfExtractor implements IExtractor {
  supports(filename: string, mimeType: string) {
    return mimeType === "application/pdf" || /\.pdf$/i.test(filename);
  }

  extract(buffer: Buffer): ExtractionResult {
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new ValidationError("Invalid PDF signature.");
    }
    const raw = buffer.toString("latin1");
    const objects = raw.split(/(?=\d+\s+\d+\s+obj\b)/g);
    const pageObjects = objects.filter((value) => /\/Type\s*\/Page\b/.test(value));
    const decodedStreams = objects.map((value) => this.decodeStream(value)).filter((value): value is string => Boolean(value));
    // PDFs frequently compress their text streams. When exact page-to-stream
    // mapping is unavailable, retain sequential page metadata rather than
    // dropping text or inventing a page number.
    const sources = pageObjects.length ? pageObjects.map((page, index) => page + "\n" + (decodedStreams[index] || "")) : decodedStreams;
    const pages = sources.map((source, index) => ({ number: index + 1, text: this.readText(source) })).filter((page) => page.text.trim());
    const text = pages.map((page) => page.text).join("\n\n");
    if (!text.trim()) {
      throw new ValidationError("PDF has no embedded text. Upload an OCR-enabled PDF or add an OCR extractor.");
    }
    return { text, pages, detectedFormat: "PDF" };
  }

  private readText(source: string): string {
    const fragments: string[] = [];
    const literal = /\((?:\\.|[^\\)])*\)\s*(?:Tj|')/g;
    for (const match of source.matchAll(literal)) {
      fragments.push(match[0].replace(/\s*(?:Tj|')$/, "").slice(1, -1).replace(/\\([()\\])/g, "$1").replace(/\\n/g, "\n"));
    }
    return fragments.join(" ").replace(/\s+/g, " ").trim();
  }

  private decodeStream(object: string): string | null {
    const marker = object.indexOf("stream");
    const end = object.indexOf("endstream", marker + 6);
    if (marker < 0 || end < 0) return null;
    const rawStream = object.slice(marker + 6, end).replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    try {
      if (/\/FlateDecode/.test(object)) return inflateRawSync(Buffer.from(rawStream, "latin1")).toString("latin1");
      return rawStream;
    } catch {
      return rawStream;
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
  constructor(private readonly extractors: IExtractor[] = [new PdfExtractor(), new DocxExtractor(), new TextExtractor()]) {}

  extract(filename: string, mimeType: string, buffer: Buffer): ExtractionResult {
    const extractor = this.extractors.find((candidate) => candidate.supports(filename, mimeType));
    if (!extractor) throw new UnsupportedFileTypeError(`No extractor is registered for ${filename} (${mimeType}).`);
    return extractor.extract(buffer);
  }
}
