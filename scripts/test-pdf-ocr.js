/**
 * DOMAIN COPILOT - PDF OCR FALLBACK DETERMINISTIC TEST SUITE (Step 3)
 *
 * Verifies that when PDF Quality Gate determines normal text extraction is unusable,
 * an OCR fallback path is provided so scanned/image-only PDFs can be ingested.
 *
 * Scenarios covered:
 * 1. Normal English text PDF: Quality Gate passes -> OCR is NOT called.
 * 2. Normal Arabic PDF: Quality Gate passes -> OCR is NOT called.
 * 3. Bilingual Arabic + English PDF: Quality Gate passes -> OCR is NOT called.
 * 4. Scanned / image-only PDF: Normal extraction fails -> OCR invoked -> page-aware output -> Quality Gate passes -> Cleaning -> Chunking.
 * 5. Scanned Arabic PDF: OCR extracts Arabic text correctly -> Arabic Unicode preserved -> Quality Gate accepts OCR result.
 * 6. Scanned bilingual PDF: Arabic and English both survive OCR -> Page mapping preserved.
 * 7. OCR failure: OCR returns empty/unusable text -> actionable error returned -> no document indexed.
 * 8. Regression: Step 1 PDF extraction tests and Step 2 Quality Gate tests continue to pass.
 * 9. Adapter verification: TesseractOcrAdapter configuration, isAvailable(), language resolution, and form-feed page parsing.
 */

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Register on-the-fly TypeScript transpile for testing source files directly
const ts = require("typescript");
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(outputText, filename);
};

// Domain & Application imports directly from source
const { PdfQualityGate } = require("../src/core/application/ingestion/quality-gate.ts");
const { IngestionService } = require("../src/core/application/ingestion/ingestion.service.ts");
const { TesseractOcrAdapter } = require("../src/infrastructure/ocr/tesseract-ocr.adapter.ts");
const { ExtractionQualityError, IngestionFailedError } = require("../src/core/domain/errors.ts");

// PDF Generators for deterministic multi-page testing
function generateEnglishMultiPagePdf() {
  const page1Content = `BT /F1 12 Tf 50 700 Td (Clinical Practice Protocol) Tj ET
BT /F1 10 Tf 50 670 Td (Section 1: Initial Assessment and Patient Triage Procedures) Tj ET
BT /F1 10 Tf 50 640 Td (All presenting patients must undergo standardized biometric and clinical evaluation.) Tj ET
BT /F1 10 Tf 50 610 Td (Vital signs including blood pressure, heart rate, and oxygen saturation must be recorded.) Tj ET`;

  const page2Content = `BT /F1 12 Tf 50 700 Td (Section 2: Pharmacological Intervention Guidelines) Tj ET
BT /F1 10 Tf 50 670 Td (First-line dosage recommendations require continuous monitoring of hepatic markers.) Tj ET
BT /F1 10 Tf 50 640 Td (In cases of contraindication, alternative therapeutic pathways must be initiated immediately.) Tj ET
BT /F1 10 Tf 50 610 Td (Documentation of dosage adjustments is mandatory within the electronic health record.) Tj ET`;

  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >> endobj
4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >> endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
6 0 obj << /Length ${Buffer.byteLength(page1Content)} >> stream
${page1Content}
endstream
endobj
7 0 obj << /Length ${Buffer.byteLength(page2Content)} >> stream
${page2Content}
endstream
endobj
xref
0 8
0000000000 65535 f 
trailer << /Root 1 0 R /Size 8 >>
startxref
0
%%EOF`;
  return Buffer.from(pdf, "utf-8");
}

function generateUnicodePdf({ pagesData }) {
  const allChars = Array.from(new Set(pagesData.join("") + " "));
  const cidMap = new Map();
  allChars.forEach((ch, idx) => {
    cidMap.set(ch, idx + 1);
  });

  let cmapEntries = "";
  for (const [ch, cid] of cidMap.entries()) {
    const cidHex = cid.toString(16).padStart(4, "0");
    const unicodeHex = ch.charCodeAt(0).toString(16).padStart(4, "0");
    cmapEntries += `<${cidHex}> <${cidHex}> <${unicodeHex}>\n`;
  }

  const cmapData = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> def
/CMapName /Custom-ToUnicode def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${cidMap.size} beginbfrange
${cmapEntries}endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

  function textToHex(text) {
    let hex = "";
    for (const ch of text) {
      const cid = cidMap.get(ch) || 0;
      hex += cid.toString(16).padStart(4, "0");
    }
    return hex;
  }

  const streams = pagesData.map((text) => {
    const hex = textToHex(text);
    return `BT /F1 12 Tf 50 700 Td <${hex}> Tj ET`;
  });

  const pageCount = pagesData.length;
  const pageKids = [];
  for (let i = 0; i < pageCount; i++) {
    pageKids.push(`${3 + i} 0 R`);
  }

  let objects = "";
  objects += `1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n`;
  objects += `2 0 obj << /Type /Pages /Kids [${pageKids.join(" ")}] /Count ${pageCount} >> endobj\n`;

  const fontObjNum = 3 + pageCount;
  const descendantFontNum = fontObjNum + 1;
  const fontDescriptorNum = fontObjNum + 2;
  const cmapObjNum = fontObjNum + 3;
  const streamStartNum = cmapObjNum + 1;

  for (let i = 0; i < pageCount; i++) {
    const pageNum = 3 + i;
    const contentNum = streamStartNum + i;
    objects += `${pageNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentNum} 0 R >> endobj\n`;
  }

  objects += `${fontObjNum} 0 obj << /Type /Font /Subtype /Type0 /BaseFont /CustomFont /Encoding /Identity-H /DescendantFonts [${descendantFontNum} 0 R] /ToUnicode ${cmapObjNum} 0 R >> endobj\n`;
  objects += `${descendantFontNum} 0 obj << /Type /Font /Subtype /CIDFontType2 /BaseFont /CustomFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fontDescriptorNum} 0 R >> endobj\n`;
  objects += `${fontDescriptorNum} 0 obj << /Type /FontDescriptor /FontName /CustomFont /Flags 4 /Ascent 728 /Descent -210 /CapHeight 728 /ItalicAngle 0 >> endobj\n`;
  objects += `${cmapObjNum} 0 obj << /Length ${Buffer.byteLength(cmapData)} >>\nstream\n${cmapData}\nendstream\nendobj\n`;

  streams.forEach((s, idx) => {
    const sNum = streamStartNum + idx;
    objects += `${sNum} 0 obj << /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream\nendobj\n`;
  });

  const totalObjs = streamStartNum + pageCount;
  const pdf = `%PDF-1.4\n${objects}xref\n0 ${totalObjs}\n0000000000 65535 f \ntrailer << /Root 1 0 R /Size ${totalObjs} >>\nstartxref\n0\n%%EOF`;
  return Buffer.from(pdf, "utf-8");
}

function generateBlankScannedPdf() {
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f 
trailer << /Root 1 0 R /Size 4 >>
startxref
0
%%EOF`;
  return Buffer.from(pdf, "utf-8");
}

// In-memory test mock database and vector store for IngestionService
function createMockPipelineServices() {
  const documents = new Map();
  const versions = new Map();
  const jobs = new Map();
  const chunks = new Map();
  const embeddings = new Map();

  const mockDb = {
    getDocumentBySource: async (source, name) => {
      for (const d of documents.values()) {
        if (d.source === source && d.name === name) return d;
      }
      return null;
    },
    saveDocument: async (doc) => {
      documents.set(doc.id, { ...doc });
      return documents.get(doc.id);
    },
    getActiveVersion: async (docId) => {
      for (const v of versions.values()) {
        if (v.documentId === docId && v.isActive) return v;
      }
      return null;
    },
    archiveActiveVersions: async (docId) => {
      for (const v of versions.values()) {
        if (v.documentId === docId) v.isActive = false;
      }
    },
    saveDocumentVersion: async (ver) => {
      versions.set(ver.id, { ...ver });
      return versions.get(ver.id);
    },
    saveIngestionJob: async (job) => {
      jobs.set(job.id, { ...job });
      return jobs.get(job.id);
    },
    updateIngestionJob: async (update) => {
      const existing = jobs.get(update.id) || {};
      const updated = { ...existing, ...update };
      jobs.set(update.id, updated);
      return updated;
    },
    listIngestionJobs: async () => Array.from(jobs.values()),
    saveChunks: async (newChunks) => {
      for (const c of newChunks) chunks.set(c.id, c);
    },
  };

  const mockVectorStore = {
    saveBatchEmbeddings: async (items) => {
      for (const item of items) embeddings.set(item.id, item);
    },
  };

  const mockAiProvider = {
    generateBatchEmbeddings: async (texts) => {
      return texts.map(() => ({
        embedding: new Array(1536).fill(0.01),
        model: "text-embedding-3-small",
        dimension: 1536,
      }));
    },
  };

  return { mockDb, mockVectorStore, mockAiProvider, storage: { documents, versions, jobs, chunks, embeddings } };
}

// Spy / Mock OCR Port
class MockOcrPort {
  constructor(handler) {
    this.calls = [];
    this.handler = handler;
    this.available = true;
  }

  setAvailable(available) {
    this.available = available;
  }

  async isAvailable() {
    return this.available;
  }

  async extractText(input) {
    this.calls.push(input);
    if (typeof this.handler === "function") {
      return this.handler(input);
    }
    return {
      text: "Default OCR extracted text page 1",
      pages: [{ number: 1, text: "Default OCR extracted text page 1" }],
      detectedFormat: "PDF",
    };
  }
}

async function runOcrTestSuite() {
  console.log("================================================================================");
  console.log("PDF OCR FALLBACK DETERMINISTIC TEST SUITE (ING-002 / Step 3)");
  console.log("Verifying OCR fallback port, bilingual support, quality handling, and citations");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ FAIL: ${name} ->`, err.message);
      if (err.stack) {
        console.error(err.stack.split("\n").slice(1, 4).join("\n"));
      }
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Normal English text PDF -> Quality Gate passes, OCR is NOT called
  // ---------------------------------------------------------------------------
  await test("1. Normal English text PDF: Quality Gate passes and OCR is NOT called", async () => {
    const { mockDb, mockVectorStore, mockAiProvider } = createMockPipelineServices();
    const mockOcr = new MockOcrPort();
    const service = new IngestionService(mockDb, mockVectorStore, mockAiProvider, mockOcr);

    const pdfBuf = generateEnglishMultiPagePdf();
    const result = await service.ingestDocument({
      filename: "clinical_protocol_en.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuf,
    });

    assert.strictEqual(result.document.status, "INDEXED");
    assert.strictEqual(result.version.pages, 2);
    assert.strictEqual(result.version.extractionMethod, "normal");
    assert.strictEqual(mockOcr.calls.length, 0, "OCR must NOT be called for normal English PDF");
  });

  // ---------------------------------------------------------------------------
  // 2. Normal Arabic PDF -> Quality Gate passes, OCR is NOT called
  // ---------------------------------------------------------------------------
  await test("2. Normal Arabic PDF: Quality Gate passes and OCR is NOT called", async () => {
    const { mockDb, mockVectorStore, mockAiProvider } = createMockPipelineServices();
    const mockOcr = new MockOcrPort();
    const service = new IngestionService(mockDb, mockVectorStore, mockAiProvider, mockOcr);

    const arabicPage1 = "دليل الممارسة السريرية لأمراض القلب والأوعية الدموية في المستشفيات المعتمدة وطرق العلاج الوقائي.";
    const arabicPage2 = "إجراءات الفحص المخبري وتوصيات الجرعات الدوائية للمرضى المعرضين للخطر الشديد في أقسام الطوارئ.";
    const pdfBuf = generateUnicodePdf({ pagesData: [arabicPage1, arabicPage2] });

    const result = await service.ingestDocument({
      filename: "clinical_protocol_ar.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuf,
    });

    assert.strictEqual(result.document.status, "INDEXED");
    assert.strictEqual(result.version.language, "ar");
    assert.strictEqual(result.version.extractionMethod, "normal");
    assert.strictEqual(mockOcr.calls.length, 0, "OCR must NOT be called for normal Arabic PDF");
  });

  // ---------------------------------------------------------------------------
  // 3. Bilingual Arabic + English PDF -> Quality Gate passes, OCR is NOT called
  // ---------------------------------------------------------------------------
  await test("3. Bilingual Arabic + English PDF: Quality Gate passes and OCR is NOT called", async () => {
    const { mockDb, mockVectorStore, mockAiProvider } = createMockPipelineServices();
    const mockOcr = new MockOcrPort();
    const service = new IngestionService(mockDb, mockVectorStore, mockAiProvider, mockOcr);

    const bilingualPage1 = "وزارة الصحة العامة - Ministry of Public Health. Clinical Practice Guidelines for Triage.";
    const bilingualPage2 = "قسم الطوارئ والرعاية الحرجة - Emergency Department and Intensive Care Unit Clinical Protocol.";
    const pdfBuf = generateUnicodePdf({ pagesData: [bilingualPage1, bilingualPage2] });

    const result = await service.ingestDocument({
      filename: "clinical_bilingual.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuf,
    });

    assert.strictEqual(result.document.status, "INDEXED");
    assert.strictEqual(result.version.language, "ar"); // bilingual maps to 'ar' for RTL / dual indexing
    assert.strictEqual(result.version.extractionMethod, "normal");
    assert.strictEqual(mockOcr.calls.length, 0, "OCR must NOT be called for normal bilingual PDF");
  });

  // ---------------------------------------------------------------------------
  // 4. Scanned/image-only PDF -> Normal fails, OCR invoked, page-aware, continues
  // ---------------------------------------------------------------------------
  await test("4. Scanned/image-only PDF: Normal fails Quality Gate, OCR invoked, page-aware output continues to Chunking", async () => {
    const { mockDb, mockVectorStore, mockAiProvider, storage } = createMockPipelineServices();

    const ocrPage1Text = "Clinical Research Protocol: Assessment of Novel Therapeutics in Oncology\nSection 1: Patient Eligibility Criteria";
    const ocrPage2Text = "Methods and Materials: Dosage schedule, patient monitoring intervals, and outcome measurements.\nSection 2: Pharmacokinetics";

    const mockOcr = new MockOcrPort(async (input) => {
      return {
        text: `${ocrPage1Text}\n\n${ocrPage2Text}`,
        pages: [
          { number: 1, text: ocrPage1Text },
          { number: 2, text: ocrPage2Text },
        ],
        detectedFormat: "PDF",
      };
    });

    const service = new IngestionService(mockDb, mockVectorStore, mockAiProvider, mockOcr);
    const blankScannedPdf = generateBlankScannedPdf();

    const result = await service.ingestDocument({
      filename: "scanned_oncology_report.pdf",
      mimeType: "application/pdf",
      buffer: blankScannedPdf,
    });

    // 1. OCR was called exactly once
    assert.strictEqual(mockOcr.calls.length, 1);
    assert.strictEqual(mockOcr.calls[0].filename, "scanned_oncology_report.pdf");

    // 2. Result succeeded
    assert.strictEqual(result.document.status, "INDEXED");
    assert.strictEqual(result.version.pages, 2);
    assert.strictEqual(result.version.extractionMethod, "ocr");

    // 3. Chunks were created, preserving page 1 and page 2 citations
    const chunks = Array.from(storage.chunks.values());
    assert.ok(chunks.length >= 2, "Must create chunks for pages 1 and 2");

    const page1Chunk = chunks.find((c) => c.page === 1);
    const page2Chunk = chunks.find((c) => c.page === 2);
    assert.ok(page1Chunk, "Must contain a chunk with page=1 citation reference");
    assert.ok(page2Chunk, "Must contain a chunk with page=2 citation reference");
    assert.strictEqual(page1Chunk.metadata.extractionMethod, "ocr");
    assert.strictEqual(page2Chunk.metadata.extractionMethod, "ocr");
  });

  // ---------------------------------------------------------------------------
  // 5. Scanned Arabic PDF -> OCR extracts Arabic correctly, passes Quality Gate
  // ---------------------------------------------------------------------------
  await test("5. Scanned Arabic PDF: OCR extracts Arabic correctly, characters preserved, Quality Gate accepts result", async () => {
    const { mockDb, mockVectorStore, mockAiProvider } = createMockPipelineServices();

    const arabicOcrText = "بروتوكول الفحص السريري: إرشادات الممارسة الطبية المعتمدة للرعاية الصحية في المستشفيات والمراكز المتخصصة.";
    const mockOcr = new MockOcrPort(async () => {
      return {
        text: arabicOcrText,
        pages: [{ number: 1, text: arabicOcrText }],
        detectedFormat: "PDF",
      };
    });

    const service = new IngestionService(mockDb, mockVectorStore, mockAiProvider, mockOcr);
    const blankScannedPdf = generateBlankScannedPdf();

    const result = await service.ingestDocument({
      filename: "scanned_arabic_guidelines.pdf",
      mimeType: "application/pdf",
      buffer: blankScannedPdf,
    });

    assert.strictEqual(result.document.status, "INDEXED");
    assert.strictEqual(result.version.language, "ar");
    assert.strictEqual(result.version.extractionMethod, "ocr");
    assert.ok(result.version.pages === 1);
  });

  // ---------------------------------------------------------------------------
  // 6. Scanned bilingual PDF -> Both Arabic and English survive OCR, page mapping correct
  // ---------------------------------------------------------------------------
  await test("6. Scanned bilingual PDF: Arabic and English both survive OCR, page mapping preserved", async () => {
    const { mockDb, mockVectorStore, mockAiProvider, storage } = createMockPipelineServices();

    const page1Bilingual = "وزارة الصحة العامة - Ministry of Public Health. Emergency Guidelines for Critical Care.";
    const page2Bilingual = "إرشادات الجرعات الدوائية - Medication Dosage Recommendations and Patient Monitoring Protocols.";

    const mockOcr = new MockOcrPort(async () => {
      return {
        text: `${page1Bilingual}\n\n${page2Bilingual}`,
        pages: [
          { number: 1, text: page1Bilingual },
          { number: 2, text: page2Bilingual },
        ],
        detectedFormat: "PDF",
      };
    });

    const service = new IngestionService(mockDb, mockVectorStore, mockAiProvider, mockOcr);
    const blankScannedPdf = generateBlankScannedPdf();

    const result = await service.ingestDocument({
      filename: "scanned_bilingual_policy.pdf",
      mimeType: "application/pdf",
      buffer: blankScannedPdf,
    });

    assert.strictEqual(result.document.status, "INDEXED");
    assert.strictEqual(result.version.language, "ar");
    assert.strictEqual(result.version.extractionMethod, "ocr");

    const chunks = Array.from(storage.chunks.values());
    const chunkPage1 = chunks.find((c) => c.page === 1);
    const chunkPage2 = chunks.find((c) => c.page === 2);
    assert.ok(chunkPage1.text.includes("Ministry of Public Health"));
    assert.ok(chunkPage1.text.includes("وزارة الصحة العامة"));
    assert.ok(chunkPage2.text.includes("Medication Dosage"));
    assert.ok(chunkPage2.text.includes("إرشادات الجرعات"));
  });

  // ---------------------------------------------------------------------------
  // 7. OCR Failure -> Empty/unusable text returned, actionable error, not indexed
  // ---------------------------------------------------------------------------
  await test("7. OCR failure: Returns empty or unusable text, returns actionable error, document not indexed", async () => {
    const { mockDb, mockVectorStore, mockAiProvider, storage } = createMockPipelineServices();

    // OCR returns unusable text (e.g. low density or replacement characters)
    const mockOcr = new MockOcrPort(async () => {
      return {
        text: "???",
        pages: [{ number: 1, text: "???" }],
        detectedFormat: "PDF",
      };
    });

    const service = new IngestionService(mockDb, mockVectorStore, mockAiProvider, mockOcr);
    const blankScannedPdf = generateBlankScannedPdf();

    await assert.rejects(
      async () => {
        await service.ingestDocument({
          filename: "bad_scan.pdf",
          mimeType: "application/pdf",
          buffer: blankScannedPdf,
        });
      },
      (err) => {
        assert.ok(err instanceof IngestionFailedError);
        assert.ok(
          err.message.includes("PDF OCR fallback quality check failed") ||
          err.message.includes("OCR text is unusable"),
          `Expected OCR quality error message, got: ${err.message}`
        );
        return true;
      }
    );

    // Verify document was marked as FAILED and zero chunks were indexed
    const doc = await mockDb.getDocumentBySource("bad_scan.pdf", "bad_scan.pdf");
    assert.strictEqual(doc.status, "FAILED");
    assert.strictEqual(storage.chunks.size, 0, "No chunks should be indexed when OCR fails");
  });

  // ---------------------------------------------------------------------------
  // 8. OCR Disabled / Unavailable -> Clear message indicating normal extraction failed
  // ---------------------------------------------------------------------------
  await test("8. OCR Disabled: When OCR is unavailable, clear error indicates normal extraction failed", async () => {
    const { mockDb, mockVectorStore, mockAiProvider } = createMockPipelineServices();

    // OCR is disabled / unavailable
    const mockOcr = new MockOcrPort();
    mockOcr.setAvailable(false);

    const service = new IngestionService(mockDb, mockVectorStore, mockAiProvider, mockOcr);
    const blankScannedPdf = generateBlankScannedPdf();

    await assert.rejects(
      async () => {
        await service.ingestDocument({
          filename: "scanned_no_ocr.pdf",
          mimeType: "application/pdf",
          buffer: blankScannedPdf,
        });
      },
      (err) => {
        assert.ok(err instanceof IngestionFailedError);
        assert.ok(
          err.message.includes("OCR fallback is not available or disabled") ||
          err.message.includes("PDF has no embedded text"),
          `Expected message indicating OCR unavailable, got: ${err.message}`
        );
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 9. TesseractOcrAdapter unit tests: configuration, CLI mock executor, page parsing
  // ---------------------------------------------------------------------------
  await test("9. TesseractOcrAdapter: Configuration, language resolution, and form-feed page splitting", async () => {
    let capturedCmd = "";
    let capturedArgs = [];

    const mockExecutor = async (cmd, args) => {
      capturedCmd = cmd;
      capturedArgs = args;
      // Simulate Tesseract output with 2 pages delimited by \f
      const outputTxtPath = `${args[1]}.txt`;
      const simulatedOutput = "Page 1 Tesseract OCR content here.\nSection A\fPage 2 Tesseract OCR content here.\nSection B\f";
      fs.writeFileSync(outputTxtPath, simulatedOutput, "utf8");
      return { stdout: "", stderr: "" };
    };

    const adapter = new TesseractOcrAdapter(
      {
        enabled: true,
        binaryPath: "mock-tesseract",
        languages: "ara+eng",
        timeoutMs: 15000,
      },
      mockExecutor
    );

    const isAvail = await adapter.isAvailable();
    assert.strictEqual(isAvail, true);

    const result = await adapter.extractText({
      filename: "test_doc.pdf",
      buffer: Buffer.from("%PDF-1.4 test"),
      languageHint: "ar",
    });

    assert.strictEqual(capturedCmd, "mock-tesseract");
    assert.strictEqual(capturedArgs[2], "-l");
    assert.strictEqual(capturedArgs[3], "ara+eng");

    assert.strictEqual(result.detectedFormat, "PDF");
    assert.strictEqual(result.pages.length, 2);
    assert.strictEqual(result.pages[0].number, 1);
    assert.ok(result.pages[0].text.includes("Page 1 Tesseract OCR content"));
    assert.strictEqual(result.pages[1].number, 2);
    assert.ok(result.pages[1].text.includes("Page 2 Tesseract OCR content"));
  });

  // ---------------------------------------------------------------------------
  // 10. Quality Gate evaluates OCR output accurately
  // ---------------------------------------------------------------------------
  await test("10. Quality Gate evaluates OCR output and accepts bilingual result", async () => {
    const qualityGate = new PdfQualityGate();
    const ocrResult = {
      text: "وزارة الصحة العامة - Ministry of Public Health. Clinical Practice Guidelines.",
      pages: [
        {
          number: 1,
          text: "وزارة الصحة العامة - Ministry of Public Health. Clinical Practice Guidelines.",
        },
      ],
      detectedFormat: "PDF",
      extractionMethod: "ocr",
    };

    const report = qualityGate.evaluate(ocrResult);
    assert.strictEqual(report.usable, true);
    assert.strictEqual(report.detectedLanguage, "bilingual");
    assert.ok(report.score >= 0.7);
  });

  console.log("================================================================================");
  console.log(`PDF OCR Fallback Suite Results: ${passed} Passed, ${failed} Failed.`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runOcrTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
