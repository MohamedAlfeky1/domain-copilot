/**
 * DOMAIN COPILOT - FOCUSED PDF EXTRACTION REGRESSION SUITE
 * Tests PDF text extraction powered by pdfjs-dist:
 * 1. Normal English text PDF across multiple pages
 * 2. Arabic text PDF with Unicode preservation (no mojibake)
 * 3. Bilingual Arabic + English text PDF
 * 4. The previously failing/garbled PDF fixture (blueprint)
 * 5. Page number preservation and chunking compatibility
 * 6. Empty / scanned / invalid PDF failure contracts
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Load pdfjs-dist legacy engine with resolved CMaps and standard fonts
const pdfjs = require(path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.mjs"));
const cMapUrl = path.join(process.cwd(), "node_modules/pdfjs-dist/cmaps/").replace(/\\/g, "/").replace(/\/?$/, "/");
const standardFontDataUrl = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/").replace(/\\/g, "/").replace(/\/?$/, "/");

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.httpStatus = 400;
  }
}

/**
 * Standard PDF text extractor implementation matching src/core/application/ingestion/extraction.ts
 */
class PdfExtractor {
  supports(filename, mimeType) {
    return mimeType === "application/pdf" || /\.pdf$/i.test(filename);
  }

  async extract(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new ValidationError("Invalid PDF signature.");
    }

    try {
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        cMapUrl,
        cMapPacked: true,
        standardFontDataUrl,
      });

      const doc = await loadingTask.promise;
      const numPages = doc.numPages;
      const pages = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();

        const lines = [];
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
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new ValidationError(`Failed to parse PDF document: ${message}`);
    }
  }
}

// -----------------------------------------------------------------------------
// PDF Generator Helpers
// -----------------------------------------------------------------------------

function generateEnglishMultiPagePdf() {
  const page1Content = "BT /F1 14 Tf 50 700 Td (Clinical Guidelines: Cardiology Protocol) Tj 0 -25 Td (Section 1: Indications for Beta Blockers) Tj ET";
  const page2Content = "BT /F1 14 Tf 50 700 Td (Section 2: Contraindications & Adverse Reactions) Tj 0 -25 Td (Do not administer in severe bradycardia) Tj ET";

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
  // Extract all unique characters across pages
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
  // Obj 1: Catalog
  objects += `1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n`;
  // Obj 2: Pages
  objects += `2 0 obj << /Type /Pages /Kids [${pageKids.join(" ")}] /Count ${pageCount} >> endobj\n`;

  // Page objects: 3 to 2 + pageCount
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

  // Font definitions
  objects += `${fontObjNum} 0 obj << /Type /Font /Subtype /Type0 /BaseFont /CustomFont /Encoding /Identity-H /DescendantFonts [${descendantFontNum} 0 R] /ToUnicode ${cmapObjNum} 0 R >> endobj\n`;
  objects += `${descendantFontNum} 0 obj << /Type /Font /Subtype /CIDFontType2 /BaseFont /CustomFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fontDescriptorNum} 0 R >> endobj\n`;
  objects += `${fontDescriptorNum} 0 obj << /Type /FontDescriptor /FontName /CustomFont /Flags 4 /Ascent 728 /Descent -210 /CapHeight 728 /ItalicAngle 0 >> endobj\n`;
  objects += `${cmapObjNum} 0 obj << /Length ${Buffer.byteLength(cmapData)} >>\nstream\n${cmapData}\nendstream\nendobj\n`;

  // Content streams
  streams.forEach((s, idx) => {
    const sNum = streamStartNum + idx;
    objects += `${sNum} 0 obj << /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream\nendobj\n`;
  });

  const totalObjs = streamStartNum + pageCount;
  const pdf = `%PDF-1.4\n${objects}xref\n0 ${totalObjs}\n0000000000 65535 f \ntrailer << /Root 1 0 R /Size ${totalObjs} >>\nstartxref\n0\n%%EOF`;
  return Buffer.from(pdf, "utf-8");
}

function generateBlankScannedPdf() {
  // A PDF with 1 page but no text stream (e.g. image-only / scanned)
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

// -----------------------------------------------------------------------------
// Test Runner
// -----------------------------------------------------------------------------

async function runPdfTestSuite() {
  console.log("================================================================================");
  console.log("PDF TEXT EXTRACTION & ENCODING REGRESSION SUITE");
  console.log("Testing Mozilla PDF.js (pdfjs-dist) Extraction, Page Metadata & Unicode Support");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ FAIL: ${name}`);
      console.error(`  Error: ${err.message}`);
      if (err.stack) console.error(err.stack.split("\n").slice(1, 4).join("\n"));
      failed++;
    }
  }

  const extractor = new PdfExtractor();

  // 1. Normal English text PDF
  await test("Normal multi-page English text PDF is extracted with correct text and structure", async () => {
    const pdfBuf = generateEnglishMultiPagePdf();
    const result = await extractor.extract(pdfBuf);

    assert.strictEqual(result.detectedFormat, "PDF");
    assert.strictEqual(result.pages.length, 2);
    assert.strictEqual(result.pages[0].number, 1);
    assert.strictEqual(result.pages[1].number, 2);

    assert.ok(result.pages[0].text.includes("Clinical Guidelines: Cardiology Protocol"));
    assert.ok(result.pages[0].text.includes("Section 1: Indications for Beta Blockers"));
    assert.ok(result.pages[1].text.includes("Section 2: Contraindications & Adverse Reactions"));
    assert.ok(result.pages[1].text.includes("Do not administer in severe bradycardia"));
    assert.ok(result.text.includes("Section 1") && result.text.includes("Section 2"));
  });

  // 2. Arabic text PDF
  await test("Arabic text PDF preserves Arabic Unicode characters without mojibake or corruption", async () => {
    const arabicText = "دليل الممارسة السريرية لارتفاع ضغط الدم الشرياني ٢٠٢٦";
    const pdfBuf = generateUnicodePdf({ pagesData: [arabicText] });
    const result = await extractor.extract(pdfBuf);

    assert.strictEqual(result.pages.length, 1);
    assert.strictEqual(result.pages[0].number, 1);

    // Verify Arabic characters are intact
    const extracted = result.pages[0].text;
    assert.ok(extracted.length > 0);
    // Ensure no replacement characters
    assert.ok(!extracted.includes("\uFFFD"), "Extracted text must not contain replacement character \\uFFFD");
    assert.ok(!extracted.includes("?"), "Extracted text must not contain unmapped '?' characters");
    // Verify Arabic unicode range detection
    const arabicCharCount = (extracted.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
    assert.ok(arabicCharCount >= 10, `Expected >= 10 Arabic characters, got ${arabicCharCount}`);
  });

  // 3. Bilingual Arabic + English PDF
  await test("Bilingual Arabic + English PDF extracts both scripts accurately on the same document", async () => {
    const page1 = "Ministry of Health - Clinical Practice Guidelines 2026";
    const page2 = "وزارة الصحة - الدليل الإرشادي للممارسات السريرية";
    const page3 = "Dosage Protocol الجرعة: 500mg twice daily مرتين يومياً";

    const pdfBuf = generateUnicodePdf({ pagesData: [page1, page2, page3] });
    const result = await extractor.extract(pdfBuf);

    assert.strictEqual(result.pages.length, 3);
    assert.strictEqual(result.pages[0].number, 1);
    assert.strictEqual(result.pages[1].number, 2);
    assert.strictEqual(result.pages[2].number, 3);

    // Page 1: English
    assert.ok(result.pages[0].text.includes("Ministry of Health"));
    // Page 2: Arabic
    assert.ok(!result.pages[1].text.includes("\uFFFD"));
    assert.ok((result.pages[1].text.match(/[\u0600-\u06FF]/g) || []).length >= 10);
    // Page 3: Mixed bilingual
    assert.ok(result.pages[2].text.includes("Dosage Protocol"));
    assert.ok(result.pages[2].text.includes("500mg"));
    assert.ok((result.pages[2].text.match(/[\u0600-\u06FF]/g) || []).length >= 5);
  });

  // 4. Previously failing/garbled PDF fixture
  await test("Previously failing PDF fixture extracts valid blueprint text instead of garbled mojibake", async () => {
    const fixturePath = path.join(__dirname, "../fixtures/pdf/previously_failing_blueprint.pdf");
    assert.ok(fs.existsSync(fixturePath), "Fixture previously_failing_blueprint.pdf must exist");

    const pdfBuf = fs.readFileSync(fixturePath);
    const result = await extractor.extract(pdfBuf);

    // Must have 19 pages
    assert.strictEqual(result.pages.length, 19);

    // Prior custom extractor produced garbled mojibake like: "É¢µ$ gdŒ‘- yLFFq²E¸#¸ý¥..."
    // Ensure that corrupted string does NOT appear anywhere
    assert.ok(!result.text.includes("É¢µ$"), "Extracted text must not contain previous mojibake binary fragments");

    // Check key blueprint keywords that were previously corrupted
    assert.ok(result.text.includes("DOMAIN COPILOT"), "Must extract DOMAIN COPILOT header");
    assert.ok(result.text.includes("An Agentic RAG Platform"), "Must extract subtitle");
    assert.ok(result.text.includes("ACCEPTANCE CRITERIA"), "Must extract ACCEPTANCE CRITERIA");
    assert.ok(result.text.includes("✓"), "Must extract Unicode checkmark character ✓");

    // Page 1 assertions
    assert.strictEqual(result.pages[0].number, 1);
    assert.ok(result.pages[0].text.includes("DOMAIN COPILOT"));
    assert.ok(result.pages[0].text.includes("Assessment-Aligned Agile Backlog"));
  });

  // 5. Page number preservation & chunking compatibility
  await test("Preserves page numbers and produces page-aware structure compatible with chunking", async () => {
    const pdfBuf = generateEnglishMultiPagePdf();
    const result = await extractor.extract(pdfBuf);

    // Verify page numbers are strictly 1-indexed sequential integers
    result.pages.forEach((page, idx) => {
      assert.strictEqual(page.number, idx + 1);
      assert.ok(typeof page.text === "string" && page.text.trim().length > 0);
    });

    // Simulate chunkStage consumption from ingestion.service.ts
    const simulatedChunks = [];
    result.pages.forEach((page) => {
      simulatedChunks.push({
        id: `chk-test-${page.number}`,
        page: page.number,
        text: page.text,
        section: "Cardiology",
      });
    });

    assert.strictEqual(simulatedChunks.length, 2);
    assert.strictEqual(simulatedChunks[0].page, 1);
    assert.strictEqual(simulatedChunks[1].page, 2);
    assert.strictEqual(simulatedChunks[0].section, "Cardiology");
  });

  // 6. Empty / scanned / invalid PDF failure behavior
  await test("Invalid PDF signature throws ValidationError", async () => {
    const invalidBuf = Buffer.from("NOT_A_PDF_FILE_HEADER");
    await assert.rejects(
      async () => extractor.extract(invalidBuf),
      (err) => err instanceof ValidationError && err.message.includes("Invalid PDF signature")
    );
  });

  await test("Empty/scanned PDF without text throws actionable ValidationError requesting OCR", async () => {
    const blankBuf = generateBlankScannedPdf();
    await assert.rejects(
      async () => extractor.extract(blankBuf),
      (err) => err instanceof ValidationError && err.message.includes("PDF has no embedded text")
    );
  });

  await test("Corrupted PDF payload throws descriptive ValidationError", async () => {
    const corruptBuf = Buffer.from("%PDF-1.4\n1 0 obj << CORRUPT BROKEN SYNTAX >>");
    await assert.rejects(
      async () => extractor.extract(corruptBuf),
      (err) => err instanceof ValidationError && err.message.includes("Failed to parse PDF document")
    );
  });

  console.log("================================================================================");
  console.log(`PDF Extraction Suite Results: ${passed} Passed, ${failed} Failed.`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPdfTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
