/**
 * DOMAIN COPILOT - PDF EXTRACTION QUALITY GATE TEST SUITE (Step 2)
 *
 * Verifies that the PDF Quality Gate correctly determines whether extracted text
 * is usable before cleaning and chunking.
 *
 * Tests:
 * 1. Valid English PDF text -> accepted
 * 2. Valid Arabic PDF text -> accepted
 * 3. Valid bilingual Arabic + English text -> accepted
 * 4. Text containing normal Unicode symbols -> accepted
 * 5. Text with replacement characters / severe mojibake -> rejected
 * 6. Extremely low text density -> rejected
 * 7. Empty/near-empty extraction -> rejected
 * 8. Mixed document where one page is badly corrupted -> rejected with page-specific diagnosis
 * 9. Previously failing PDF fixture from Step 1 -> accepted
 * 10. Explicit verification that valid Arabic is NOT rejected by heuristics
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_SCRIPT_REGEX = /[a-zA-Z]/;
const DIGIT_REGEX = /[0-9\u0660-\u0669\u06F0-\u06F9]/;
const REPLACEMENT_CHAR_REGEX = /\uFFFD/;
const SUSPICIOUS_CONTROL_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const VALID_SYMBOLS_REGEX = /[\s.,;:!?'"()[\]{}<>\/\\-_+=*&%$#@~^|`\u2018\u2019\u201C\u201D\u2013\u2014\u2022\u2023\u25E6\u2026±×÷°µ≤≥≠≈€$£¥©®™✓✔✗✘→←،؛؟ـ«»]/;

const DEFAULT_CONFIG = {
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

class ExtractionQualityError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExtractionQualityError";
    this.code = "EXTRACTION_QUALITY_ERROR";
    this.httpStatus = 400;
  }
}

class PdfQualityGate {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluate(result) {
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

    const pageReports = pages.map((p) => this.evaluatePage(p));

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

    const totalAlpha = totalArabicChars + totalLatinChars;
    let detectedLanguage = "unknown";
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

    const reasons = [];

    if (totalChars < this.config.minTotalChars) {
      reasons.push(`Total extracted text density is extremely low (${totalChars} characters, minimum is ${this.config.minTotalChars}).`);
    }

    if (avgCharsPerPage < this.config.minAvgCharsPerPage) {
      reasons.push(`Average text density per page is too low (${avgCharsPerPage.toFixed(1)} chars/page, minimum is ${this.config.minAvgCharsPerPage}).`);
    }

    if (
      overallReplacementCharRatio > this.config.maxReplacementCharRatio ||
      totalReplacementChars > this.config.maxReplacementCharCount
    ) {
      reasons.push(`Excessive Unicode replacement characters detected (${totalReplacementChars} characters, ${(overallReplacementCharRatio * 100).toFixed(1)}%).`);
    }

    if (overallControlCharRatio > this.config.maxControlCharRatio) {
      reasons.push(`Excessive control characters detected (${(overallControlCharRatio * 100).toFixed(1)}%).`);
    }

    if (overallValidCharRatio < this.config.minValidCharRatio) {
      reasons.push(`Low valid character ratio (${(overallValidCharRatio * 100).toFixed(1)}% valid, minimum is ${(this.config.minValidCharRatio * 100).toFixed(1)}%).`);
    }

    const failedPages = pageReports.filter((p) => !p.isUsable);
    if (failedPages.length > 0) {
      const pageDetails = failedPages.map((p) => `page ${p.pageNumber}: ${p.issues.join(", ")}`).join("; ");
      reasons.push(`Unusable pages detected (${failedPages.length}/${totalPages} pages): ${pageDetails}`);
    }

    if (score < this.config.minCompositeScore) {
      reasons.push(`Composite quality score ${score.toFixed(2)} is below minimum threshold ${this.config.minCompositeScore.toFixed(2)}.`);
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

  assertUsable(result) {
    const report = this.evaluate(result);
    if (!report.usable) {
      const reasonSummary = report.reasons.join(" ");
      throw new ExtractionQualityError(
        `PDF extraction quality check failed (score: ${report.score.toFixed(2)}). ${reasonSummary} Upload an OCR-enabled PDF or add an OCR extractor.`
      );
    }
    return report;
  }

  evaluatePage(page) {
    const text = page.text || "";
    const charCount = text.length;

    let arabicCharCount = 0;
    let latinCharCount = 0;
    let digitCount = 0;
    let replacementCharCount = 0;
    let controlCharCount = 0;
    let validSymbolCount = 0;

    for (const ch of text) {
      if (REPLACEMENT_CHAR_REGEX.test(ch)) replacementCharCount++;
      else if (SUSPICIOUS_CONTROL_REGEX.test(ch)) controlCharCount++;
      else if (ARABIC_SCRIPT_REGEX.test(ch)) arabicCharCount++;
      else if (LATIN_SCRIPT_REGEX.test(ch)) latinCharCount++;
      else if (DIGIT_REGEX.test(ch)) digitCount++;
      else if (VALID_SYMBOLS_REGEX.test(ch)) validSymbolCount++;
    }

    const validCharTotal = arabicCharCount + latinCharCount + digitCount + validSymbolCount;
    const validCharRatio = charCount > 0 ? validCharTotal / charCount : 0;
    const replacementCharRatio = charCount > 0 ? replacementCharCount / charCount : 0;
    const controlCharRatio = charCount > 0 ? controlCharCount / charCount : 0;

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
    const issues = [];

    if (charCount < this.config.minPageChars) {
      issues.push(`insufficient text density (${charCount} chars)`);
    }

    if (
      replacementCharRatio > this.config.maxReplacementCharRatio ||
      replacementCharCount > this.config.maxReplacementCharCount
    ) {
      issues.push(`excessive replacement characters (${replacementCharCount} chars, ${(replacementCharRatio * 100).toFixed(1)}%)`);
    }

    if (controlCharRatio > this.config.maxControlCharRatio) {
      issues.push(`excessive control characters (${(controlCharRatio * 100).toFixed(1)}%)`);
    }

    if (validCharRatio < this.config.minValidCharRatio) {
      issues.push(`low valid character ratio (${(validCharRatio * 100).toFixed(1)}%)`);
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

async function runQualityGateTestSuite() {
  console.log("================================================================================");
  console.log("PDF EXTRACTION QUALITY GATE TEST SUITE (ING-002 / Step 2)");
  console.log("Validating heuristics: density, encoding, Unicode ranges, and error contracts");
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

  const gate = new PdfQualityGate();

  // Test 1: Valid English PDF text -> accepted
  await test("1. Valid English clinical protocol PDF text is accepted", () => {
    const input = {
      detectedFormat: "PDF",
      text: "Cardiology Clinical Guideline 2026\n\nSection 1: Indications for ACE Inhibitors\nPatients presenting with heart failure should be initiated on low-dose lisinopril with titration every 2 weeks.",
      pages: [
        {
          number: 1,
          text: "Cardiology Clinical Guideline 2026\n\nSection 1: Indications for ACE Inhibitors\nPatients presenting with heart failure should be initiated on low-dose lisinopril with titration every 2 weeks.",
        },
      ],
    };

    const report = gate.assertUsable(input);
    assert.strictEqual(report.usable, true);
    assert.ok(report.score >= 0.85);
    assert.strictEqual(report.detectedLanguage, "en");
    assert.strictEqual(report.usablePages, 1);
    assert.strictEqual(report.reasons.length, 0);
  });

  // Test 2: Valid Arabic PDF text -> accepted
  await test("2. Valid Arabic medical guideline text is accepted without rejection", () => {
    const input = {
      detectedFormat: "PDF",
      text: "دليل الممارسة السريرية لارتفاع ضغط الدم الشرياني ٢٠٢٦\n\nالقسم الأول: دواعي استعمال حاصرات بيتا\nيجب مراقبة ضغط الدم الشرياني ومعدل النبض بانتظام عند وصف العلاج للمرضى.",
      pages: [
        {
          number: 1,
          text: "دليل الممارسة السريرية لارتفاع ضغط الدم الشرياني ٢٠٢٦\n\nالقسم الأول: دواعي استعمال حاصرات بيتا\nيجب مراقبة ضغط الدم الشرياني ومعدل النبض بانتظام عند وصف العلاج للمرضى.",
        },
      ],
    };

    const report = gate.assertUsable(input);
    assert.strictEqual(report.usable, true);
    assert.ok(report.score >= 0.85);
    assert.strictEqual(report.detectedLanguage, "ar");
    assert.ok(report.pageReports[0].arabicCharCount > 50);
  });

  // Test 3: Valid bilingual Arabic + English text -> accepted
  await test("3. Valid bilingual Arabic + English text is accepted and recognized as bilingual", () => {
    const input = {
      detectedFormat: "PDF",
      text: "Ministry of Health Guidelines 2026\nوزارة الصحة - الدليل الإرشادي للممارسات السريرية\n\nDosage Instructions الجرعة الدوائية: 500mg daily مرتين يومياً",
      pages: [
        {
          number: 1,
          text: "Ministry of Health Guidelines 2026\nوزارة الصحة - الدليل الإرشادي للممارسات السريرية",
        },
        {
          number: 2,
          text: "Dosage Instructions الجرعة الدوائية: 500mg daily مرتين يومياً",
        },
      ],
    };

    const report = gate.assertUsable(input);
    assert.strictEqual(report.usable, true);
    assert.strictEqual(report.detectedLanguage, "bilingual");
    assert.strictEqual(report.usablePages, 2);
  });

  // Test 4: Text containing normal Unicode symbols -> accepted
  await test("4. Text containing normal mathematical, typographic and scientific symbols is accepted", () => {
    const input = {
      detectedFormat: "PDF",
      text: "Clinical Assessment Checklist (✓ Approved):\n• Blood Pressure: 120/80 mmHg ± 5%\n• Creatinine clearance ≥ 60 mL/min\n• Body temperature: 37°C — Normal Range\n• Drug cost estimate: €50 / $55 / £45 [Protocol ® / ™]",
      pages: [
        {
          number: 1,
          text: "Clinical Assessment Checklist (✓ Approved):\n• Blood Pressure: 120/80 mmHg ± 5%\n• Creatinine clearance ≥ 60 mL/min\n• Body temperature: 37°C — Normal Range\n• Drug cost estimate: €50 / $55 / £45 [Protocol ® / ™]",
        },
      ],
    };

    const report = gate.assertUsable(input);
    assert.strictEqual(report.usable, true);
    assert.ok(report.score >= 0.85);
  });

  // Test 5: Text with replacement characters / severe mojibake -> rejected
  await test("5. Text with excessive replacement characters or corrupted binary mojibake is rejected", () => {
    const corruptedInput = {
      detectedFormat: "PDF",
      text: "Clinical \uFFFD\uFFFD\uFFFD protocol \uFFFD\uFFFD\uFFFD\uFFFD\uFFFD error \uFFFD\uFFFD\uFFFD unreadable stream",
      pages: [
        {
          number: 1,
          text: "Clinical \uFFFD\uFFFD\uFFFD protocol \uFFFD\uFFFD\uFFFD\uFFFD\uFFFD error \uFFFD\uFFFD\uFFFD unreadable stream",
        },
      ],
    };

    assert.throws(
      () => gate.assertUsable(corruptedInput),
      (err) => {
        return (
          err instanceof ExtractionQualityError &&
          err.code === "EXTRACTION_QUALITY_ERROR" &&
          err.message.includes("replacement characters") &&
          err.message.includes("OCR")
        );
      }
    );
  });

  // Test 6: Extremely low text density -> rejected
  await test("6. Extremely low text density across multiple pages is rejected", () => {
    const lowDensityInput = {
      detectedFormat: "PDF",
      text: "A B C",
      pages: [
        { number: 1, text: "A" },
        { number: 2, text: "B" },
        { number: 3, text: "C" },
      ],
    };

    assert.throws(
      () => gate.assertUsable(lowDensityInput),
      (err) => {
        return (
          err instanceof ExtractionQualityError &&
          err.message.includes("extremely low") &&
          err.message.includes("chars/page")
        );
      }
    );
  });

  // Test 7: Empty / near-empty extraction -> rejected
  await test("7. Empty or near-empty extraction is rejected", () => {
    const emptyInput = {
      detectedFormat: "PDF",
      text: "",
      pages: [],
    };

    assert.throws(
      () => gate.assertUsable(emptyInput),
      (err) => {
        return (
          err instanceof ExtractionQualityError &&
          err.message.includes("no extracted pages")
        );
      }
    );
  });

  // Test 8: Mixed document where one page is badly corrupted -> rejected with page-specific diagnosis
  await test("8. Multi-page document with one corrupted page is rejected with page diagnosis", () => {
    const mixedInput = {
      detectedFormat: "PDF",
      text: "Clean page 1 content\n\nCorrupted page 2 \uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\n\nClean page 3 content",
      pages: [
        {
          number: 1,
          text: "Section 1: Standard cardiovascular evaluation protocol and vital monitoring guidelines.",
        },
        {
          number: 2,
          text: "Corrupted \uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD unmapped font glyphs",
        },
        {
          number: 3,
          text: "Section 3: Therapeutic discharge protocol and patient follow-up appointments.",
        },
      ],
    };

    const report = gate.evaluate(mixedInput);
    assert.strictEqual(report.usable, false);
    assert.strictEqual(report.usablePages, 2);
    assert.strictEqual(report.totalPages, 3);
    assert.strictEqual(report.pageReports[0].isUsable, true);
    assert.strictEqual(report.pageReports[1].isUsable, false);
    assert.strictEqual(report.pageReports[2].isUsable, true);

    // Verify assertUsable throws mentioning page 2
    assert.throws(
      () => gate.assertUsable(mixedInput),
      (err) => {
        return (
          err instanceof ExtractionQualityError &&
          err.message.includes("page 2")
        );
      }
    );
  });

  // Test 9: Previously failing PDF fixture from Step 1 -> accepted if extraction is valid
  await test("9. Previously failing PDF fixture from Step 1 passes quality gate with clean text", async () => {
    const fixturePath = path.join(__dirname, "../fixtures/pdf/previously_failing_blueprint.pdf");
    assert.ok(fs.existsSync(fixturePath), "Blueprint fixture must exist");

    const pdfjs = require(path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.mjs"));
    const cMapUrl = path.join(process.cwd(), "node_modules/pdfjs-dist/cmaps/").replace(/\\/g, "/").replace(/\/?$/, "/");
    const standardFontDataUrl = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/").replace(/\\/g, "/").replace(/\/?$/, "/");

    const buf = fs.readFileSync(fixturePath);
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      useSystemFonts: true,
      cMapUrl,
      cMapPacked: true,
      standardFontDataUrl,
    }).promise;

    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const text = tc.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      pages.push({ number: i, text });
    }

    const extractionResult = {
      detectedFormat: "PDF",
      text: pages.map((p) => p.text).join("\n\n"),
      pages,
    };

    const report = gate.assertUsable(extractionResult);
    assert.strictEqual(report.usable, true);
    assert.strictEqual(report.totalPages, 19);
    assert.strictEqual(report.usablePages, 19);
    assert.ok(report.score >= 0.90, `Score must be >= 0.90, got ${report.score}`);
    assert.strictEqual(report.metrics.overallReplacementCharRatio, 0);
  });

  // Test 10: Verify valid Arabic is NOT rejected by heuristics
  await test("10. Valid Arabic corpus text is confirmed accepted with high validity ratio", () => {
    const arabicText = `المبادئ التوجيهية لممارسة طب القلب السريري لعام ٢٠٢٦
الفصل الأول: تشخيص قصور القلب المزمن
يتم تشخيص قصور القلب الاحتقاني بناءً على الفحص السريري، تخطيط صدى القلب، ومستوى الببتيد المدر للصوديوم (BNP).
الجرعة الدوائية الموصى بها:
١. مثبطات الإنزيم المحول للأنجيوتنسين: يُبدأ بجرعة منخفضة ٢.٥ ملغ مرتين يومياً.
٢. حاصرات مستقبلات بيتا: كارفيديلول ٣.١٢٥ ملغ مرتين يومياً مع المراقبة الدقيقة لضغط الدم والنبض.
موانع الاستعمال:
- بطء القلب الجيبي الحاد (أقل من ٥٠ نبضة في الدقيقة).
- الربو القصبي الشديد أو الصدمة القلبية.`;

    const input = {
      detectedFormat: "PDF",
      text: arabicText,
      pages: [{ number: 1, text: arabicText }],
    };

    const report = gate.assertUsable(input);
    assert.strictEqual(report.usable, true);
    assert.strictEqual(report.detectedLanguage, "ar");
    assert.ok(report.metrics.overallValidCharRatio >= 0.95);
    assert.strictEqual(report.reasons.length, 0);
  });

  console.log("================================================================================");
  console.log(`PDF Quality Gate Suite Results: ${passed} Passed, ${failed} Failed.`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runQualityGateTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
