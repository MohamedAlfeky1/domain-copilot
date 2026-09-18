/**
 * DOMAIN COPILOT - INGEST MINIMAL CORPUS WITH REAL GEMINI EMBEDDINGS
 *
 * 1. Resets database state (wipes old 34-document corpus and vectors).
 * 2. Ingests exactly the 3 new medical documents from fixtures/corpus:
 *    - Anaphylaxis / Allergy Emergency
 *    - Type 2 Diabetes / Metabolic Care
 *    - Acute Respiratory & Cardiovascular Emergency
 * 3. Generates REAL Gemini Embedding 001 (1536d) embeddings for all chunks.
 * 4. Verifies zero OpenAI vectors, zero mock vectors, and zero stale documents.
 * 5. Persists fresh state to data/db_state.json.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
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

const { DatabaseAdapter, dbAdapter } = require("../src/infrastructure/db/database.adapter.ts");
const { GeminiEmbeddingAdapter } = require("../src/infrastructure/ai/gemini-embedding.adapter.ts");
const { IngestionService } = require("../src/core/application/ingestion/ingestion.service.ts");

async function runIngestion() {
  console.log("================================================================================");
  console.log("DOMAIN COPILOT: RESETTING CORPUS & INGESTING 3 MINIMAL MEDICAL DOCUMENTS");
  console.log("================================================================================");

  // 1. Verify Gemini API Key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes("your_gemini_api_key")) {
    console.error("FATAL: GEMINI_API_KEY is missing or invalid in environment.");
    process.exit(1);
  }
  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || "models/gemini-embedding-001";
  console.log(`Embedding Provider: Gemini (Live)`);
  console.log(`Embedding Model:    ${embeddingModel}`);
  console.log(`Target Dimension:   1536`);

  // 2. Wipe old files from disk
  const dataDir = path.join(process.cwd(), "data");
  const statePath = path.join(dataDir, "db_state.json");
  const migrationPath = path.join(dataDir, "corpus_migration_state.json");

  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
    console.log("✓ Cleared old data/db_state.json");
  }

  // 3. Reset in-memory / PGlite database
  const db = new DatabaseAdapter();
  await db.ensurePgReady();

  // Clear in-memory maps
  db["documents"].clear();
  db["versions"].clear();
  db["chunks"].clear();
  db["embeddings"].clear();
  db["jobs"].clear();

  // Clear PGlite tables
  const pg = db.getPgInstance();
  if (pg) {
    await pg.query("DELETE FROM chunk_embeddings;");
    await pg.query("DELETE FROM chunks;");
    await pg.query("DELETE FROM document_versions;");
    await pg.query("DELETE FROM documents;");
    console.log("✓ Cleared PGlite database tables");
  }

  // 4. Initialize Gemini Embedding Adapter
  const geminiAdapter = new GeminiEmbeddingAdapter({
    apiKey,
    model: embeddingModel,
    dimension: 1536,
  });

  // 5. Initialize Ingestion Service
  const ingestionService = new IngestionService(db, db, geminiAdapter);

  // 6. Discover the 3 documents in fixtures/corpus
  const fixturesDir = path.join(process.cwd(), "fixtures", "corpus");
  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith(".txt")).sort();

  console.log(`\nFound ${files.length} documents in fixtures/corpus:`);
  files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

  if (files.length !== 3) {
    console.error(`FATAL: Expected exactly 3 documents in fixtures/corpus, found ${files.length}`);
    process.exit(1);
  }

  // 7. Ingest each document
  console.log("\nBeginning ingestion & real Gemini embedding generation...");
  const docStats = [];

  for (const filename of files) {
    const filePath = path.join(fixturesDir, filename);
    const content = fs.readFileSync(filePath, "utf-8");
    const buffer = Buffer.from(content, "utf-8");

    console.log(`\n--> Ingesting: ${filename} (${buffer.length} bytes)...`);
    const startTime = Date.now();

    const result = await ingestionService.ingestDocument({
      filename,
      mimeType: "text/plain",
      buffer,
      source: filename,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`    ✓ Ingested Document ID: ${result.document.id}`);
    console.log(`    ✓ Version ID:           ${result.version.id}`);
    console.log(`    ✓ Status:               ${result.document.status} (${elapsed}s)`);

    // Get chunks for this version
    const chunks = await db.getChunksByVersion(result.version.id);
    console.log(`    ✓ Chunks generated:     ${chunks.length}`);
    docStats.push({ filename, docId: result.document.id, chunkCount: chunks.length });

    // Polite delay between documents
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // 8. Save state to disk
  db.saveToDisk();
  console.log("\n✓ Persisted clean state to data/db_state.json");

  // 9. Write migration state
  fs.writeFileSync(
    migrationPath,
    JSON.stringify(
      {
        corpus: "minimal-3-doc-development",
        status: "COMPLETED",
        embeddingProvider: "gemini",
        embeddingModel,
        embeddingDimension: 1536,
        documentsCount: 3,
        documents: docStats,
        completedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  // 10. Comprehensive Verification
  console.log("\n================================================================================");
  console.log("VERIFICATION AUDIT:");
  console.log("================================================================================");

  const allDocs = await db.listDocuments();
  console.log(`Total Documents in Database: ${allDocs.length} (Expected: 3)`);
  if (allDocs.length !== 3) {
    throw new Error(`Audit failure: expected exactly 3 documents, found ${allDocs.length}`);
  }

  let totalChunks = 0;
  for (const stat of docStats) {
    console.log(`  - [${stat.filename}]: ${stat.chunkCount} chunks`);
    totalChunks += stat.chunkCount;
  }
  console.log(`Total Chunks: ${totalChunks}`);

  // Inspect raw saved disk state
  const savedRaw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  const savedEmbeddings = savedRaw.embeddings || [];
  console.log(`Saved Embeddings on Disk: ${savedEmbeddings.length} (Expected: ${totalChunks})`);

  if (savedEmbeddings.length !== totalChunks) {
    throw new Error(`Embedding count mismatch: ${savedEmbeddings.length} vs ${totalChunks}`);
  }

  // Verify all embeddings are real Gemini embeddings
  let openaiCount = 0;
  let mockCount = 0;
  let invalidDimCount = 0;
  let geminiCount = 0;

  for (const [id, emb] of savedEmbeddings) {
    if (emb.model.includes("openai") || emb.model.includes("text-embedding")) {
      openaiCount++;
    }
    if (emb.model.includes("gemini") || emb.model.includes("embedding-001")) {
      geminiCount++;
    }
    if (emb.dimension !== 1536 || emb.vector.length !== 1536) {
      invalidDimCount++;
    }

    // Check if vector looks synthetic (Math.sin pattern)
    // Synthetic formula: Math.round(Math.sin(hash + i) * 10000) / 10000
    // Real Gemini embeddings have floating point values with ~16 decimals and unit norm
    let sumSq = 0;
    for (let i = 0; i < emb.vector.length; i++) {
      sumSq += emb.vector[i] * emb.vector[i];
    }
    const norm = Math.sqrt(sumSq);
    if (Math.abs(norm - 1.0) > 0.01) {
      mockCount++;
    }
  }

  console.log(`✓ Real Gemini Embeddings: ${geminiCount} / ${totalChunks}`);
  console.log(`✓ Dimension 1536 Check:   ${totalChunks - invalidDimCount} / ${totalChunks}`);
  console.log(`✓ OpenAI Embeddings:      ${openaiCount} (Must be 0)`);
  console.log(`✓ Unnormalized / Mock:    ${mockCount} (Must be 0)`);

  if (openaiCount > 0 || mockCount > 0 || invalidDimCount > 0) {
    throw new Error("Audit failure: detected non-Gemini, unnormalized, or wrong dimension vectors!");
  }

  console.log("\n================================================================================");
  console.log("MINIMAL CORPUS INGESTION & GEMINI EMBEDDING COMPLETED SUCCESSFULLY!");
  console.log("================================================================================");
}

runIngestion().catch((err) => {
  console.error("FATAL ERROR during minimal corpus ingestion:", err);
  process.exit(1);
});
