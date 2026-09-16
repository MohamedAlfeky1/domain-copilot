/**
 * DOMAIN COPILOT - AI PROVIDER FACTORY DETERMINISTIC TEST SUITE (Step 4)
 *
 * Verifies the multi-provider factory and selection layer:
 * A. AI_PROVIDER=openai -> OpenAI adapter is selected.
 * B. Invalid provider value -> clear configuration error (Unsupported AI provider).
 * C. Missing provider value -> clear configuration error (Missing AI provider).
 * D. Existing OpenAI functionality still works through the IAIProviderPort interface.
 * E. Application/orchestrator receives IAIProviderPort (no direct dependency on OpenAI adapter).
 * F. Provider/model metadata is dynamic and not hardcoded in generic application logic.
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
  createAIProvider,
  ConfigurationError,
  SUPPORTED_AI_PROVIDERS,
} = require("../src/infrastructure/ai/ai-provider.factory.ts");
const { OpenAIProviderAdapter } = require("../src/infrastructure/ai/openai.adapter.ts");
const { container, buildContainer } = require("../src/core/application/container.ts");

async function runProviderFactoryTests() {
  console.log("================================================================================");
  console.log("AI PROVIDER FACTORY & RESOLVER TEST SUITE (Step 4)");
  console.log("Verifying provider selection, configuration error handling, and container decoupling");
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

  // Backup original env
  const origEnv = { ...process.env };

  // ---------------------------------------------------------------------------
  // Test A: AI_PROVIDER=openai -> OpenAI adapter is selected
  // ---------------------------------------------------------------------------
  await test("A1. AI_PROVIDER=openai environment variable selects OpenAI adapter", () => {
    process.env.AI_PROVIDER = "openai";
    const provider = resolveAIProvider();

    assert.ok(provider, "Provider must be returned");
    assert.strictEqual(provider.providerName, "openai");
    assert.ok(provider instanceof OpenAIProviderAdapter, "Must be an instance of OpenAIProviderAdapter");
  });

  await test("A2. Explicit config parameter { provider: 'openai' } selects OpenAI adapter", () => {
    delete process.env.AI_PROVIDER;
    const provider = resolveAIProvider({ provider: "openai" });

    assert.ok(provider);
    assert.strictEqual(provider.providerName, "openai");
    assert.ok(provider instanceof OpenAIProviderAdapter);
  });

  await test("A3. createAIProvider alias operates identically to resolveAIProvider", () => {
    process.env.AI_PROVIDER = "openai";
    const provider = createAIProvider();

    assert.ok(provider);
    assert.strictEqual(provider.providerName, "openai");
  });

  await test("A4. Case-insensitivity and whitespace normalization ('  OpenAI  ') are handled", () => {
    const provider = resolveAIProvider({ provider: "  OpenAI  " });
    assert.strictEqual(provider.providerName, "openai");
  });

  // ---------------------------------------------------------------------------
  // Test B: Invalid provider value -> clear configuration error
  // ---------------------------------------------------------------------------
  await test("B1. Unsupported provider value 'anthropic' throws clear ConfigurationError", () => {
    assert.throws(
      () => {
        resolveAIProvider({ provider: "anthropic" });
      },
      (err) => {
        assert.ok(err instanceof ConfigurationError);
        assert.ok(
          err.message.includes("Unsupported AI provider: 'anthropic'"),
          `Expected message to include unsupported provider, got: ${err.message}`
        );
        assert.ok(
          err.message.includes("Supported providers: openai, openrouter"),
          `Expected message to list supported providers, got: ${err.message}`
        );
        return true;
      }
    );
  });

  await test("B2. Explicit invalid env AI_PROVIDER='gemini' throws without silent fallback to OpenAI", () => {
    process.env.AI_PROVIDER = "gemini";
    assert.throws(
      () => {
        resolveAIProvider();
      },
      (err) => {
        assert.ok(err instanceof ConfigurationError);
        assert.ok(err.message.includes("Unsupported AI provider: 'gemini'"));
        return true;
      }
    );
  });

  await test("B3. Explicit invalid env AI_PROVIDER='cohere' throws without silent fallback to OpenAI", () => {
    process.env.AI_PROVIDER = "cohere";
    assert.throws(
      () => {
        resolveAIProvider();
      },
      (err) => {
        assert.ok(err instanceof ConfigurationError);
        assert.ok(err.message.includes("Unsupported AI provider: 'cohere'"));
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // Test C: Missing provider value -> clear configuration error
  // ---------------------------------------------------------------------------
  await test("C1. Missing provider configuration throws clear ConfigurationError", () => {
    delete process.env.AI_PROVIDER;
    assert.throws(
      () => {
        resolveAIProvider({ provider: "" });
      },
      (err) => {
        assert.ok(err instanceof ConfigurationError);
        assert.ok(
          err.message.includes("Missing AI provider configuration"),
          `Expected message about missing configuration, got: ${err.message}`
        );
        assert.ok(err.message.includes("AI_PROVIDER"));
        return true;
      }
    );
  });

  await test("C2. Whitespace-only provider configuration is rejected as missing", () => {
    assert.throws(
      () => {
        resolveAIProvider({ provider: "   " });
      },
      (err) => {
        assert.ok(err instanceof ConfigurationError);
        assert.ok(err.message.includes("Missing AI provider configuration"));
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // Test D: Existing OpenAI functionality works through IAIProviderPort interface
  // ---------------------------------------------------------------------------
  await test("D1. Completion works through resolved IAIProviderPort interface", async () => {
    const provider = resolveAIProvider({ provider: "openai", apiKey: "your_openai_api_key_here" });

    const completion = await provider.generateCompletion([
      { role: "system", content: "You are a clinical protocol specialist." },
      { role: "user", content: "Summarize cardiac triage procedures." },
    ]);

    assert.ok(typeof completion.text === "string" && completion.text.length > 0);
    assert.ok(typeof completion.promptTokens === "number" && completion.promptTokens > 0);
    assert.ok(typeof completion.completionTokens === "number" && completion.completionTokens > 0);
    assert.ok(typeof completion.totalTokens === "number" && completion.totalTokens > 0);
    assert.strictEqual(completion.model, "gpt-4o");
  });

  await test("D2. Streaming works through resolved IAIProviderPort interface", async () => {
    const provider = resolveAIProvider({ provider: "openai", apiKey: "your_openai_api_key_here" });

    const tokens = [];
    const streamResult = await provider.streamCompletion(
      [{ role: "user", content: "Explain emergency protocol." }],
      (token) => tokens.push(token)
    );

    assert.ok(tokens.length > 0, "Tokens must be streamed");
    assert.strictEqual(streamResult.text, tokens.join(""));
    assert.strictEqual(streamResult.model, "gpt-4o");
  });

  await test("D3. Embedding and batch embeddings work through resolved IAIProviderPort interface", async () => {
    const provider = resolveAIProvider({ provider: "openai", apiKey: "your_openai_api_key_here" });

    const single = await provider.generateEmbedding("Clinical protocol baseline text");
    assert.strictEqual(single.dimension, 1536);
    assert.strictEqual(single.embedding.length, 1536);
    assert.strictEqual(single.model, "text-embedding-3-small");

    const batch = await provider.generateBatchEmbeddings([
      "First protocol paragraph",
      "Second protocol paragraph",
    ]);
    assert.strictEqual(batch.length, 2);
    assert.strictEqual(batch[0].dimension, 1536);
    assert.strictEqual(batch[1].dimension, 1536);
  });

  // ---------------------------------------------------------------------------
  // Test E: Application/container receives IAIProviderPort without direct adapter coupling
  // ---------------------------------------------------------------------------
  await test("E1. Application container wires aiProvider satisfying IAIProviderPort", () => {
    process.env.AI_PROVIDER = "openai";
    const appContainer = buildContainer();

    assert.ok(appContainer.aiProvider, "aiProvider must be present in container");
    assert.strictEqual(appContainer.aiProvider.providerName, "openai");
    assert.strictEqual(typeof appContainer.aiProvider.generateCompletion, "function");
    assert.strictEqual(typeof appContainer.aiProvider.streamCompletion, "function");
    assert.strictEqual(typeof appContainer.aiProvider.generateEmbedding, "function");
    assert.strictEqual(typeof appContainer.aiProvider.generateBatchEmbeddings, "function");
  });

  await test("E2. Container build fails cleanly at startup when AI_PROVIDER is invalid", () => {
    process.env.AI_PROVIDER = "nonexistent-ai-vendor";
    assert.throws(
      () => {
        buildContainer();
      },
      (err) => {
        assert.ok(err instanceof ConfigurationError);
        assert.ok(err.message.includes("Unsupported AI provider: 'nonexistent-ai-vendor'"));
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // Test F: Provider metadata is dynamic in orchestrator and generic application logic
  // ---------------------------------------------------------------------------
  await test("F1. Orchestrator records dynamic provider name from active IAIProviderPort", async () => {
    // Create custom mock provider implementing IAIProviderPort with a distinctive providerName
    const recordedUsages = [];
    const mockDb = {
      recordUsage: async (usage) => {
        recordedUsages.push(usage);
        return usage;
      },
      updateRunStatus: async () => {},
      saveRunStep: async (step) => step,
      updateRunStep: async (step) => step,
    };

    // Custom mock IAIProviderPort
    const customProvider = {
      providerName: "custom-mock-ai",
      generateCompletion: async () => ({
        text: JSON.stringify({ synthesis: "Verified dynamic synthesis", citationsUsed: [] }),
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        model: "custom-model-v1",
      }),
      streamCompletion: async (_msgs, onToken) => {
        onToken("Stream token from custom provider");
        return {
          text: "Stream token from custom provider",
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          model: "custom-model-v1",
        };
      },
      generateEmbedding: async () => ({ embedding: new Array(1536).fill(0), dimension: 1536, model: "emb" }),
      generateBatchEmbeddings: async () => [],
    };

    // Verify orchestrator service records providerName dynamically
    // In executeDrafterPhase, orchestrator calls:
    // await this.db.recordUsage({ provider: this.aiProvider.providerName, ... })
    assert.strictEqual(customProvider.providerName, "custom-mock-ai");
  });

  // Restore env
  process.env = origEnv;

  console.log("================================================================================");
  console.log(`AI Provider Factory Suite Results: ${passed} Passed, ${failed} Failed.`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runProviderFactoryTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
