/**
 * DOMAIN COPILOT - GEMINI EMBEDDING ADAPTER TEST SUITE (Step 6)
 *
 * Verifies Gemini Embedding 001 Provider Adapter:
 * A. Provider Selection: EMBEDDING_PROVIDER=gemini resolves GeminiEmbeddingAdapter
 * B. Missing Configuration: Missing GEMINI_API_KEY throws ConfigurationError
 * C. Correct Model: Gemini Embedding 001 (models/embedding-001) used by default / config
 * D. Document Embedding: Request task type is RETRIEVAL_DOCUMENT for stored chunks
 * E. Query Embedding: Request task type is RETRIEVAL_QUERY for search queries
 * F. Output Dimension: Exactly 1536 dimensions; rejects wrong dimensions with typed error
 * G. Normalization: Vectors are normalized to unit Euclidean norm (L2 norm = 1.0)
 * H. Batch Embeddings: Multiple documents handled and normalized in batch
 * I. Provider Failure: 400 auth, 429 quota, 503 unavailable map to ProviderFailureError; no fake vectors
 * J. OpenAI Regression: EMBEDDING_PROVIDER=openai still selects OpenAI adapter and works
 * K. Provider Separation: AI_PROVIDER (LLM) and EMBEDDING_PROVIDER (embeddings) decoupled
 * L. No Mixed Space: Refuses mixed vector space configuration across incompatible providers/models
 */

const assert = require("assert");
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

// Domain & Infrastructure imports directly from source
const {
  resolveAIProvider,
  resolveEmbeddingProvider,
  createEmbeddingProvider,
  validateVectorSpaceConsistency,
  ConfigurationError,
} = require("../src/infrastructure/ai/ai-provider.factory.ts");
const {
  GeminiEmbeddingAdapter,
  normalizeVector,
} = require("../src/infrastructure/ai/gemini-embedding.adapter.ts");
const { OpenAIProviderAdapter } = require("../src/infrastructure/ai/openai.adapter.ts");
const { OpenRouterProviderAdapter } = require("../src/infrastructure/ai/openrouter.adapter.ts");
const { ProviderFailureError } = require("../src/core/domain/errors.ts");
const { buildContainer } = require("../src/core/application/container.ts");

// Helper to create synthetic 1536d test vector
function createRaw1536Vector(scale = 1.0) {
  const vec = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    vec[i] = Math.sin(i + 1) * scale;
  }
  return vec;
}

// Calculate Euclidean norm
function computeL2Norm(vec) {
  return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
}

async function runGeminiEmbeddingTests() {
  console.log("================================================================================");
  console.log("GEMINI EMBEDDING 001 ADAPTER TEST SUITE (Step 6)");
  console.log("Verifying 1536d embeddings, task types, normalization, and provider separation");
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

  // Preserve original environment
  const originalEnv = { ...process.env };

  try {
    // ------------------------------------------------------------------------
    // Scenario A: Provider Selection via Factory
    // ------------------------------------------------------------------------
    await test("Scenario A1: Factory resolves GeminiEmbeddingAdapter when EMBEDDING_PROVIDER=gemini", async () => {
      process.env.EMBEDDING_PROVIDER = "gemini";
      process.env.GEMINI_API_KEY = "AIzaSyTestKey1234567890abcdef1234567890";
      process.env.GEMINI_EMBEDDING_MODEL = "models/embedding-001";

      const provider = resolveEmbeddingProvider();
      assert(provider instanceof GeminiEmbeddingAdapter, "Should be GeminiEmbeddingAdapter");
      assert.strictEqual(provider.providerName, "gemini");
      assert.strictEqual(provider.getModelName(), "models/embedding-001");
      assert.strictEqual(provider.getDimension(), 1536);
    });

    await test("Scenario A2: Explicit createEmbeddingProvider({ provider: 'gemini' }) creates adapter", async () => {
      const provider = createEmbeddingProvider({
        provider: "gemini",
        apiKey: "AIzaSyExplicitKey",
        model: "embedding-001",
      });
      assert(provider instanceof GeminiEmbeddingAdapter);
      assert.strictEqual(provider.providerName, "gemini");
      assert.strictEqual(provider.getModelName(), "models/embedding-001");
    });

    // ------------------------------------------------------------------------
    // Scenario B: Missing Configuration Handling
    // ------------------------------------------------------------------------
    await test("Scenario B1: Factory throws ConfigurationError if GEMINI_API_KEY is missing", async () => {
      process.env.EMBEDDING_PROVIDER = "gemini";
      delete process.env.GEMINI_API_KEY;

      assert.throws(
        () => resolveEmbeddingProvider(),
        (err) => {
          assert(err instanceof ConfigurationError);
          assert(err.message.includes("GEMINI_API_KEY is required"));
          return true;
        }
      );
    });

    await test("Scenario B2: Factory throws ConfigurationError if GEMINI_API_KEY is empty or placeholder", async () => {
      process.env.EMBEDDING_PROVIDER = "gemini";
      process.env.GEMINI_API_KEY = "   ";

      assert.throws(
        () => resolveEmbeddingProvider(),
        (err) => {
          assert(err instanceof ConfigurationError);
          assert(err.message.includes("GEMINI_API_KEY is required"));
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // Scenario C: Correct Model Configuration
    // ------------------------------------------------------------------------
    await test("Scenario C1: Uses Gemini Embedding 001 by default", async () => {
      const adapter = new GeminiEmbeddingAdapter({
        apiKey: "AIzaSyTest",
      });
      assert.strictEqual(adapter.getModelName(), "models/embedding-001");
    });

    await test("Scenario C2: Rejects non-embedding models for Gemini embedding provider", async () => {
      assert.throws(
        () => {
          new GeminiEmbeddingAdapter({
            apiKey: "AIzaSyTest",
            model: "gemini-1.5-pro",
          });
        },
        (err) => {
          assert(err instanceof ConfigurationError);
          assert(err.message.includes("Invalid Gemini embedding model"));
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // Scenario D: Document Embedding Task Type
    // ------------------------------------------------------------------------
    await test("Scenario D1: Stored document chunk embeddings use RETRIEVAL_DOCUMENT task type", async () => {
      let capturedParams = null;
      const rawVector = createRaw1536Vector(2.5);

      const mockTransport = {
        embedContent: async (params) => {
          capturedParams = params;
          return {
            embedding: { values: rawVector },
          };
        },
      };

      const adapter = new GeminiEmbeddingAdapter({ apiKey: "AIzaSyTest" }, mockTransport);

      const res = await adapter.generateEmbedding("Clinical trial protocol section 2.4", {
        taskType: "RETRIEVAL_DOCUMENT",
      });

      assert(capturedParams !== null);
      assert.strictEqual(capturedParams.taskType, "RETRIEVAL_DOCUMENT");
      assert.strictEqual(capturedParams.outputDimensionality, 1536);
      assert.strictEqual(res.dimension, 1536);
    });

    // ------------------------------------------------------------------------
    // Scenario E: Query Embedding Task Type
    // ------------------------------------------------------------------------
    await test("Scenario E1: User search queries default to RETRIEVAL_QUERY task type", async () => {
      let capturedParams = null;
      const rawVector = createRaw1536Vector(1.0);

      const mockTransport = {
        embedContent: async (params) => {
          capturedParams = params;
          return {
            embedding: { values: rawVector },
          };
        },
      };

      const adapter = new GeminiEmbeddingAdapter({ apiKey: "AIzaSyTest" }, mockTransport);

      const res = await adapter.generateEmbedding("What is the first-line medication for hypertension?");

      assert(capturedParams !== null);
      assert.strictEqual(capturedParams.taskType, "RETRIEVAL_QUERY");
      assert.strictEqual(capturedParams.outputDimensionality, 1536);
      assert.strictEqual(res.dimension, 1536);
    });

    // ------------------------------------------------------------------------
    // Scenario F: Output Dimension Validation (1536d)
    // ------------------------------------------------------------------------
    await test("Scenario F1: Output vector has exactly 1536 dimensions", async () => {
      const rawVector = createRaw1536Vector();
      const mockTransport = {
        embedContent: async () => ({
          embedding: { values: rawVector },
        }),
      };

      const adapter = new GeminiEmbeddingAdapter({ apiKey: "AIzaSyTest" }, mockTransport);
      const res = await adapter.generateEmbedding("text");

      assert.strictEqual(res.dimension, 1536);
      assert.strictEqual(res.embedding.length, 1536);
    });

    await test("Scenario F2: Rejects unexpected vector dimension with ProviderFailureError", async () => {
      const badVector768 = new Array(768).fill(0.01);
      const mockTransport = {
        embedContent: async () => ({
          embedding: { values: badVector768 },
        }),
      };

      const adapter = new GeminiEmbeddingAdapter({ apiKey: "AIzaSyTest" }, mockTransport);

      await assert.rejects(
        async () => {
          await adapter.generateEmbedding("test text");
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert(err.message.includes("dimension 768, expected exactly 1536"));
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // Scenario G: Normalization Verification (L2 norm = 1.0)
    // ------------------------------------------------------------------------
    await test("Scenario G1: Un-normalized API vectors are normalized to unit L2 norm (~1.0)", async () => {
      // Create non-unit vector
      const unnormalized = createRaw1536Vector(5.0);
      const initialNorm = computeL2Norm(unnormalized);
      assert(Math.abs(initialNorm - 1.0) > 0.5, "Raw vector should not be unit length initially");

      const mockTransport = {
        embedContent: async () => ({
          embedding: { values: unnormalized },
        }),
      };

      const adapter = new GeminiEmbeddingAdapter({ apiKey: "AIzaSyTest" }, mockTransport);
      const res = await adapter.generateEmbedding("Clinical text");

      const finalNorm = computeL2Norm(res.embedding);
      assert(
        Math.abs(finalNorm - 1.0) < 1e-6,
        `Final vector norm must be 1.0, got: ${finalNorm}`
      );
    });

    // ------------------------------------------------------------------------
    // Scenario H: Batch Embeddings Support
    // ------------------------------------------------------------------------
    await test("Scenario H1: Batch embeddings handle multiple chunks with RETRIEVAL_DOCUMENT", async () => {
      let capturedBatchParams = null;
      const chunks = ["Paragraph 1: Cardiology", "Paragraph 2: Oncology", "Paragraph 3: Neurology"];

      const mockTransport = {
        batchEmbedContents: async (params) => {
          capturedBatchParams = params;
          return {
            embeddings: chunks.map(() => ({ values: createRaw1536Vector(3.0) })),
          };
        },
      };

      const adapter = new GeminiEmbeddingAdapter({ apiKey: "AIzaSyTest" }, mockTransport);
      const results = await adapter.generateBatchEmbeddings(chunks);

      assert.strictEqual(results.length, 3);
      assert(capturedBatchParams !== null);
      assert.strictEqual(capturedBatchParams.requests.length, 3);
      assert.strictEqual(capturedBatchParams.requests[0].taskType, "RETRIEVAL_DOCUMENT");
      assert.strictEqual(capturedBatchParams.requests[0].outputDimensionality, 1536);

      for (const res of results) {
        assert.strictEqual(res.dimension, 1536);
        assert.strictEqual(res.embedding.length, 1536);
        const norm = computeL2Norm(res.embedding);
        assert(Math.abs(norm - 1.0) < 1e-6, "Each batch vector must be normalized to 1.0");
      }
    });

    // ------------------------------------------------------------------------
    // Scenario I: Provider Failure Error Mapping
    // ------------------------------------------------------------------------
    await test("Scenario I1: 400 invalid API key maps to ProviderFailureError with zero fake vectors", async () => {
      const mockTransport = {
        embedContent: async () => {
          const err = new Error("API key not valid. Please pass a valid API key.");
          err.status = 400;
          throw err;
        },
      };

      const adapter = new GeminiEmbeddingAdapter({ apiKey: "AIzaSyInvalid" }, mockTransport);

      await assert.rejects(
        async () => {
          await adapter.generateEmbedding("query text");
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert.strictEqual(err.provider, "gemini");
          assert(err.message.includes("authentication") || err.message.includes("API key"));
          return true;
        }
      );
    });

    await test("Scenario I2: 429 quota exhaustion maps to ProviderFailureError", async () => {
      const mockTransport = {
        embedContent: async () => {
          const err = new Error("Resource has been exhausted (e.g. check quota).");
          err.status = 429;
          throw err;
        },
      };

      const adapter = new GeminiEmbeddingAdapter({ apiKey: "AIzaSyValid" }, mockTransport);

      await assert.rejects(
        async () => {
          await adapter.generateEmbedding("query text");
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert.strictEqual(err.provider, "gemini");
          assert(err.message.includes("rate limit") || err.message.includes("quota"));
          return true;
        }
      );
    });

    await test("Scenario I3: 503 service unavailable maps to ProviderFailureError", async () => {
      const mockTransport = {
        embedContent: async () => {
          const err = new Error("The service is temporarily unavailable.");
          err.status = 503;
          throw err;
        },
      };

      const adapter = new GeminiEmbeddingAdapter({ apiKey: "AIzaSyValid" }, mockTransport);

      await assert.rejects(
        async () => {
          await adapter.generateEmbedding("query text");
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert.strictEqual(err.provider, "gemini");
          assert(err.message.includes("unavailable"));
          return true;
        }
      );
    });

    await test("Scenario I4: Chat completions are guarded and refused on embedding adapter", async () => {
      const adapter = new GeminiEmbeddingAdapter({ apiKey: "AIzaSyValid" });
      await assert.rejects(
        async () => {
          await adapter.generateCompletion([{ role: "user", content: "hello" }]);
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert(err.message.includes("embedding-only provider"));
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // Scenario J: OpenAI Embedding Regression
    // ------------------------------------------------------------------------
    await test("Scenario J1: EMBEDDING_PROVIDER=openai continues to select OpenAI adapter", async () => {
      process.env.EMBEDDING_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "your_openai_api_key_here";
      delete process.env.GEMINI_API_KEY;

      const provider = resolveEmbeddingProvider();
      assert(provider instanceof OpenAIProviderAdapter);
      assert.strictEqual(provider.providerName, "openai");

      const single = await provider.generateEmbedding("Regression test text");
      assert.strictEqual(single.dimension, 1536);
      assert.strictEqual(single.embedding.length, 1536);
    });

    // ------------------------------------------------------------------------
    // Scenario K: Provider Separation
    // ------------------------------------------------------------------------
    await test("Scenario K1: AI_PROVIDER and EMBEDDING_PROVIDER are decoupled in container", async () => {
      process.env.AI_PROVIDER = "openrouter";
      process.env.OPENROUTER_API_KEY = "sk-or-test-key";
      process.env.OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";

      process.env.EMBEDDING_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "sk-openai-test-key";
      delete process.env.GEMINI_API_KEY;

      const appContainer = buildContainer();
      assert.strictEqual(appContainer.aiProvider.providerName, "openrouter");
      assert.strictEqual(appContainer.embeddingProvider.providerName, "openai");
      assert(appContainer.aiProvider instanceof OpenRouterProviderAdapter);
      assert(appContainer.embeddingProvider instanceof OpenAIProviderAdapter);
    });

    // ------------------------------------------------------------------------
    // Scenario L: No Mixed Vector Space Behavior
    // ------------------------------------------------------------------------
    await test("Scenario L1: Refuses mismatched OpenAI embedding model on Gemini provider", async () => {
      assert.throws(
        () => {
          resolveEmbeddingProvider({
            provider: "gemini",
            apiKey: "AIzaSyTest",
            model: "text-embedding-3-small",
          });
        },
        (err) => {
          assert(err instanceof ConfigurationError);
          assert(err.message.includes("Invalid embedding model 'text-embedding-3-small' for Gemini provider"));
          return true;
        }
      );
    });

    await test("Scenario L2: Refuses mismatched Gemini embedding model on OpenAI provider", async () => {
      assert.throws(
        () => {
          resolveEmbeddingProvider({
            provider: "openai",
            apiKey: "sk-test",
            model: "models/embedding-001",
          });
        },
        (err) => {
          assert(err instanceof ConfigurationError);
          assert(err.message.includes("Invalid embedding model 'models/embedding-001' for OpenAI provider"));
          return true;
        }
      );
    });

    await test("Scenario L3: validateVectorSpaceConsistency blocks cross-model vector operations", async () => {
      assert.throws(
        () => {
          validateVectorSpaceConsistency("models/embedding-001", "text-embedding-3-small");
        },
        (err) => {
          assert(err instanceof ConfigurationError);
          assert(err.message.includes("Mixed vector space detected"));
          return true;
        }
      );

      // Consistent vector space passes without error
      assert.doesNotThrow(() => {
        validateVectorSpaceConsistency("text-embedding-3-small", "text-embedding-3-small");
      });
      assert.doesNotThrow(() => {
        validateVectorSpaceConsistency("models/embedding-001", "models/embedding-001");
      });
    });
  } finally {
    // Restore environment
    process.env = originalEnv;
  }

  console.log("================================================================================");
  console.log(`GEMINI EMBEDDING ADAPTER TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runGeminiEmbeddingTests().catch((err) => {
  console.error("FATAL ERROR in Gemini embedding adapter test suite:", err);
  process.exit(1);
});
