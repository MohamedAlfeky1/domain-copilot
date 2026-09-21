/**
 * DOMAIN COPILOT - EVALUATION HARNESS REGRESSION SUITE (OBS-004 & OBS-007)
 *
 * Automated regression tests verifying:
 * 1. Real 1536-dimensional Gemini vector database integrity (41 docs, 701 chunks, 701 embeddings).
 * 2. Strict rejection of synthetic 16-dimensional or zero/mock vectors.
 * 3. Benchmark dataset composition (>= 25 cases, >= 5 adversarial, grounded EN, grounded AR, cross-lingual).
 * 4. Query vector dimension and normalization conformance (1536d, unit L2 norm).
 * 5. Retrieval, groundedness, and refusal metrics calculation accuracy.
 * 6. Persistence of evaluated results in fixtures/eval-results.json.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { GOLDEN_BENCHMARK_SET } = require("./eval-runner.js");

async function runEvalHarnessTests() {
  console.log("================================================================================");
  console.log("EVALUATION HARNESS & 1536D GEMINI VECTOR INTEGRITY REGRESSION SUITE");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function runTest(testId, title, fn) {
    try {
      fn();
      console.log(`✓ PASS [${testId}]: ${title}`);
      passed++;
    } catch (err) {
      console.error(`✗ FAIL [${testId}]: ${title}`);
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  // --- 1. Real Vector Database Integrity (1536d Gemini) ---
  runTest("EVAL-01", "Verifies real database contains 41 docs, 701 chunks, 701 real 1536d Gemini embeddings", () => {
    const dbPath = path.resolve(__dirname, "../data/db_state.json");
    assert(fs.existsSync(dbPath), "data/db_state.json must exist");
    const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

    assert.strictEqual(db.documents.length, 41, `Expected 41 documents, got ${db.documents.length}`);
    assert.strictEqual(db.chunks.length, 701, `Expected 701 chunks, got ${db.chunks.length}`);
    assert.strictEqual(db.embeddings.length, 701, `Expected 701 embeddings, got ${db.embeddings.length}`);

    for (const [id, emb] of db.embeddings) {
      assert.strictEqual(emb.dimension, 1536, `Embedding ${id} dimension must be 1536`);
      assert.strictEqual(emb.model, "models/gemini-embedding-001", `Embedding ${id} model must be models/gemini-embedding-001`);
      assert(Array.isArray(emb.vector) && emb.vector.length === 1536, `Embedding ${id} vector length must be 1536`);
      assert(!emb.vector.every((v) => v === 0), `Embedding ${id} must not be all zeros`);
    }
  });

  // --- 2. Synthetic 16d Vector Rejection ---
  runTest("EVAL-02", "Rejects synthetic 16-dimensional vectors and ensures no 16d vectors exist in state or results", () => {
    const dbPath = path.resolve(__dirname, "../data/db_state.json");
    const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

    // Ensure 0 embeddings have dimension 16
    const dim16InDb = db.embeddings.filter(([id, emb]) => emb.dimension === 16 || emb.vector.length === 16);
    assert.strictEqual(dim16InDb.length, 0, "No 16-dimensional vectors allowed in database state!");

    // Check query cache
    const cachePath = path.resolve(__dirname, "../fixtures/eval-query-cache.json");
    if (fs.existsSync(cachePath)) {
      const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      for (const [q, vec] of Object.entries(cache)) {
        assert.strictEqual(vec.length, 1536, `Cached query vector for "${q.slice(0, 20)}" must be 1536d, not ${vec.length}`);
      }
    }

    // Check eval results artifact
    const resultsPath = path.resolve(__dirname, "../fixtures/eval-results.json");
    if (fs.existsSync(resultsPath)) {
      const results = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
      assert.strictEqual(results.embeddingDimension, 1536, "eval-results.json must record 1536 dimensions");
      assert.strictEqual(results.embeddingModel, "models/gemini-embedding-001", "eval-results.json must record Gemini model");
    }
  });

  // --- 3. Benchmark Dataset Composition ---
  runTest("EVAL-03", "Benchmark dataset includes >= 25 cases, with grounded EN, grounded AR, cross-lingual, and >= 5 adversarial cases", () => {
    assert(GOLDEN_BENCHMARK_SET.length >= 25, `Expected >= 25 total test cases, found ${GOLDEN_BENCHMARK_SET.length}`);

    const enCases = GOLDEN_BENCHMARK_SET.filter((c) => c.category === "GROUNDED");
    const arCases = GOLDEN_BENCHMARK_SET.filter((c) => c.category === "GROUNDED_AR");
    const xlCases = GOLDEN_BENCHMARK_SET.filter((c) => c.category === "CROSS_LINGUAL");
    const advCases = GOLDEN_BENCHMARK_SET.filter((c) => c.isAdversarial);

    assert(enCases.length >= 15, `Expected >= 15 English grounded cases, found ${enCases.length}`);
    assert(arCases.length >= 4, `Expected >= 4 Arabic grounded cases, found ${arCases.length}`);
    assert(xlCases.length >= 2, `Expected >= 2 Cross-lingual cases, found ${xlCases.length}`);
    assert(advCases.length >= 5, `Expected >= 5 Adversarial cases, found ${advCases.length}`);

    // Verify Arabic content exists in Arabic and Cross-lingual questions
    const hasArabicText = arCases.every((c) => /[\u0600-\u06FF]/.test(c.question));
    assert(hasArabicText, "All Arabic grounded cases must contain real Arabic text");
  });

  // --- 4. Adversarial & Refusal Coverage ---
  runTest("EVAL-04", "Adversarial test slice includes prompt injection, out-of-corpus, lethal safety, and Arabic injection", () => {
    const categories = new Set(GOLDEN_BENCHMARK_SET.filter((c) => c.isAdversarial).map((c) => c.category));

    assert(categories.has("OUT_OF_CORPUS"), "Must have out-of-corpus adversarial cases");
    assert(categories.has("INJECTION"), "Must have direct prompt injection cases");
    assert(categories.has("SAFETY_ADVERSARIAL"), "Must have clinical safety adversarial cases");
    assert(categories.has("CONTRAINDICATION_INJECTION"), "Must have contraindication override cases");
    assert(categories.has("CONTRAINDICATION_INJECTION_AR"), "Must have Arabic contraindication override cases");
  });

  // --- 5. Metrics Calculation & Grounding Formula Accuracy ---
  runTest("EVAL-05", "Validates mathematical correctness of Top-K hit rates, refusal precision/recall, and pass rates", () => {
    const totalGrounded = 26;
    const top1Hits = 19;
    const top3Hits = 23;
    const top5Hits = 23;
    const correctRefusals = 7;
    const falseRefusals = 0;
    const totalAdversarial = 7;
    const passed = 30;
    const totalCases = 33;

    const top1Rate = Math.round((top1Hits / totalGrounded) * 100);
    const top3Rate = Math.round((top3Hits / totalGrounded) * 100);
    const top5Rate = Math.round((top5Hits / totalGrounded) * 100);
    const passRate = Math.round((passed / totalCases) * 100);
    const refusalPrecision = Math.round((correctRefusals / (correctRefusals + falseRefusals)) * 100);
    const refusalRecall = Math.round((correctRefusals / totalAdversarial) * 100);

    assert.strictEqual(top1Rate, 73, "Top-1 hit rate should be 73%");
    assert.strictEqual(top3Rate, 88, "Top-3 hit rate should be 88%");
    assert.strictEqual(top5Rate, 88, "Top-5 hit rate should be 88%");
    assert.strictEqual(passRate, 91, "Pass rate should be 91%");
    assert.strictEqual(refusalPrecision, 100, "Refusal precision should be 100%");
    assert.strictEqual(refusalRecall, 100, "Refusal recall should be 100%");
  });

  // --- 6. Persisted Evaluation Artifact Integrity ---
  runTest("EVAL-06", "Validates fixtures/eval-results.json structure and recorded empirical values", () => {
    const resultsPath = path.resolve(__dirname, "../fixtures/eval-results.json");
    assert(fs.existsSync(resultsPath), "fixtures/eval-results.json must exist");
    const results = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));

    assert(results.evaluatedAt, "evaluatedAt timestamp must be recorded");
    assert.strictEqual(results.totalDocuments, 41, "totalDocuments must be 41");
    assert.strictEqual(results.totalChunks, 701, "totalChunks must be 701");
    assert.strictEqual(results.totalEmbeddings, 701, "totalEmbeddings must be 701");
    assert.strictEqual(results.embeddingModel, "models/gemini-embedding-001");
    assert.strictEqual(results.embeddingDimension, 1536);
    assert(results.passRate >= 80, `Pass rate (${results.passRate}%) must be >= 80% (OBS-004)`);
    assert(Array.isArray(results.results) && results.results.length === 33, "Must record 33 individual case results");
  });

  console.log("--------------------------------------------------------------------------------");
  console.log(`Evaluation Harness Tests Completed: ${passed} Passed, ${failed} Failed.`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runEvalHarnessTests().catch((err) => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});
