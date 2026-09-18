/**
 * TEST MINIMAL CORPUS RETRIEVAL RUNTIME BEHAVIOR
 *
 * Tests:
 * 1. "ما هي أعراض الحساسية المفرطة؟" (Arabic)
 * 2. "What are the symptoms of anaphylaxis?" (English)
 * 3. "hello"
 * 4. "أهلا"
 */

require("dotenv").config();
const fs = require("fs");
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

const { dbAdapter } = require("../src/infrastructure/db/database.adapter.ts");
const { resolveEmbeddingProvider } = require("../src/infrastructure/ai/ai-provider.factory.ts");
const { HybridRetrievalService } = require("../src/core/application/retrieval/retrieval.service.ts");

async function testRetrieval() {
  console.log("================================================================================");
  console.log("RUNTIME HYBRID RETRIEVAL VERIFICATION (3-DOC CORPUS)");
  console.log("================================================================================");

  // Ensure DB ready
  await dbAdapter.ensurePgReady();
  const docs = await dbAdapter.listDocuments();
  console.log(`Active documents in corpus: ${docs.length}`);
  docs.forEach((d) => console.log(`  - ${d.name} (${d.status})`));

  // Resolve embedding provider (Gemini)
  const embeddingProvider = resolveEmbeddingProvider();
  console.log(`Resolved embedding provider: ${embeddingProvider.providerName}`);
  console.log(`Embedding model:             ${embeddingProvider.getModelName?.() || "N/A"}`);
  console.log(`Embedding dimension:         ${embeddingProvider.getDimension?.() || "N/A"}`);

  const retriever = new HybridRetrievalService(dbAdapter, embeddingProvider, dbAdapter);

  const testQueries = [
    { query: "ما هي أعراض الحساسية المفرطة؟", expectedType: "medical_evidence" },
    { query: "What are the symptoms of anaphylaxis?", expectedType: "medical_evidence" },
    { query: "hello", expectedType: "greeting_refusal" },
    { query: "أهلا", expectedType: "greeting_refusal" },
  ];

  for (const t of testQueries) {
    console.log("\n--------------------------------------------------------------------------------");
    console.log(`TEST QUERY: "${t.query}"`);
    console.log("--------------------------------------------------------------------------------");

    try {
      const result = await retriever.retrieve(t.query);
      console.log(`Evidence Score:        ${result.evidenceScore}`);
      console.log(`Refusal Required:      ${result.isRefusalRequired}`);
      if (result.refusalReason) {
        console.log(`Refusal Reason:        ${result.refusalReason}`);
      }
      console.log(`Retrieved Chunks:      ${result.chunks.length}`);
      console.log(`Citations Generated:   ${result.citations.length}`);

      if (t.expectedType === "medical_evidence") {
        if (result.isRefusalRequired) {
          console.error(`FAIL: Medical query unexpectedly triggered refusal!`);
        } else {
          console.log(`✓ SUCCESS: Relevant medical evidence retrieved!`);
          result.chunks.slice(0, 2).forEach((c, idx) => {
            console.log(`  [Chunk ${idx + 1} | ${c.metadata.documentName} | Section: ${c.section}]`);
            console.log(`  Snippet: ${c.text.slice(0, 160)}...`);
          });
        }
      } else {
        if (result.isRefusalRequired) {
          console.log(`✓ SUCCESS: Greeting correctly refused (no random medical content returned).`);
        } else {
          console.warn(`NOTICE: Greeting had high similarity or did not trigger refusal.`);
        }
      }
    } catch (err) {
      console.error(`✗ ERROR during retrieval for "${t.query}":`, err.message);
      if (err.stack) console.error(err.stack);
    }
  }
}

testRetrieval().catch(console.error);
