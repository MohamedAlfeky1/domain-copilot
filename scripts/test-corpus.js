/**
 * DOMAIN COPILOT - CORPUS VALIDATION SCRIPT (ING-008)
 * Asserts that the seeded corpus strictly satisfies:
 * 1. >= 30 documents
 * 2. >= 150 pages
 * 3. Zero real personal data (PII)
 */

const fs = require("fs");
const path = require("path");

function validateCorpus() {
  const fixturesDir = path.join(__dirname, "../fixtures/corpus");
  if (!fs.existsSync(fixturesDir)) {
    console.error("FAIL: Corpus directory not found at " + fixturesDir);
    process.exit(1);
  }

  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith(".txt"));
  let totalDocs = files.length;
  let totalPages = 0;
  let piiDetected = false;

  const PII_PATTERNS = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b4[0-9]{12}(?:[0-9]{3})?\b/, // Visa
    /\b[A-Za-z0-9._%+-]+@(?!domaincopilot\.ai)[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Non-synthetic email
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(fixturesDir, file), "utf-8");
    const pages = Math.max(1, Math.ceil(content.length / 2500));
    totalPages += pages;

    for (const pattern of PII_PATTERNS) {
      if (pattern.test(content)) {
        console.error(`FAIL: Potential PII detected in ${file}`);
        piiDetected = true;
      }
    }
  }

  console.log("=================================================");
  console.log("CORPUS VALIDATION RESULTS (ING-008):");
  console.log(`Documents count: ${totalDocs} (Required: >= 30) -> ${totalDocs >= 30 ? "PASS" : "FAIL"}`);
  console.log(`Pages count:     ${totalPages} (Required: >= 150) -> ${totalPages >= 150 ? "PASS" : "FAIL"}`);
  console.log(`PII Audit:       ${piiDetected ? "FAIL (PII detected)" : "PASS (Clean Synthetic Data)"}`);
  console.log("=================================================");

  if (totalDocs < 30 || totalPages < 150 || piiDetected) {
    console.error("Corpus validation FAILED!");
    process.exit(1);
  } else {
    console.log("ALL CORPUS VALIDATION CHECKS PASSED!");
    process.exit(0);
  }
}

validateCorpus();
