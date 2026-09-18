/**
 * DOMAIN COPILOT - OPENROUTER ADAPTER TEST SUITE (Step 5)
 *
 * Verifies the OpenRouter AI Provider Adapter:
 * A. Provider Selection: AI_PROVIDER=openrouter resolves OpenRouterProviderAdapter
 * B. Missing Configuration: Missing/empty OPENROUTER_API_KEY throws ConfigurationError
 * C. Request Formatting: Messages, roles, system prompts, headers format correctly
 * D. Streaming Support: Tokens stream progressively; returns full CompletionResult with metrics
 * E. Model Configuration & Validation: Explicit model configured; openrouter/auto rejected
 * F. Tool Calling & Structured Output: Tools formatted, tool_calls parsed from responses
 * G. Usage Ledger & Metadata: Correctly attributes provider="openrouter" and model
 * H. Provider Failure & Safety: 401, 429, 503, timeouts throw ProviderFailureError; no mock clinical text
 * I. Embedding Continuity & Regression: 1536d embeddings delegated; OpenAI provider still passes
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
} = require("../src/infrastructure/ai/ai-provider.factory.ts");
const {
  OpenRouterProviderAdapter,
} = require("../src/infrastructure/ai/openrouter.adapter.ts");
const { OpenAIProviderAdapter } = require("../src/infrastructure/ai/openai.adapter.ts");
const { ProviderFailureError } = require("../src/core/domain/errors.ts");
const {
  MultiAgentOrchestrator,
} = require("../src/core/application/agents/orchestrator.service.ts");

async function runOpenRouterTests() {
  console.log("================================================================================");
  console.log("OPENROUTER AI PROVIDER ADAPTER TEST SUITE (Step 5)");
  console.log("Verifying OpenRouter LLM completions, streaming, tool-calling, and safety");
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
    await test("Scenario A1: Factory resolves OpenRouterProviderAdapter when AI_PROVIDER=openrouter", async () => {
      process.env.AI_PROVIDER = "openrouter";
      process.env.OPENROUTER_API_KEY = "sk-or-v1-testkey1234567890abcdef1234567890";
      process.env.OPENROUTER_MODEL = "openai/gpt-4o";

      const provider = resolveAIProvider();
      assert(provider instanceof OpenRouterProviderAdapter, "Should be OpenRouterProviderAdapter");
      assert.strictEqual(provider.providerName, "openrouter");
      assert.strictEqual(provider.getModelName(), "openai/gpt-4o");
    });

    await test("Scenario A2: Explicit createAIProvider('openrouter') creates OpenRouterProviderAdapter", async () => {
      const provider = createAIProvider({
        provider: "openrouter",
        apiKey: "sk-or-v1-explicit-key",
        model: "anthropic/claude-3.5-sonnet",
      });
      assert(provider instanceof OpenRouterProviderAdapter);
      assert.strictEqual(provider.providerName, "openrouter");
      assert.strictEqual(provider.getModelName(), "anthropic/claude-3.5-sonnet");
    });

    // ------------------------------------------------------------------------
    // Scenario B: Missing Configuration Handling
    // ------------------------------------------------------------------------
    await test("Scenario B1: Factory throws ConfigurationError if OPENROUTER_API_KEY is missing", async () => {
      process.env.AI_PROVIDER = "openrouter";
      delete process.env.OPENROUTER_API_KEY;

      assert.throws(
        () => resolveAIProvider(),
        (err) => {
          assert(err instanceof ConfigurationError);
          assert(err.message.includes("OPENROUTER_API_KEY is required"));
          return true;
        }
      );
    });

    await test("Scenario B2: Factory throws ConfigurationError if OPENROUTER_API_KEY is empty or placeholder", async () => {
      process.env.AI_PROVIDER = "openrouter";
      process.env.OPENROUTER_API_KEY = "  ";

      assert.throws(
        () => resolveAIProvider(),
        (err) => {
          assert(err instanceof ConfigurationError);
          assert(err.message.includes("OPENROUTER_API_KEY is required"));
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // Scenario C: Request Formatting & Options
    // ------------------------------------------------------------------------
    await test("Scenario C1: Request messages, roles, and options format correctly", async () => {
      let capturedPayload = null;

      const mockTransport = {
        chatCompletion: async (payload) => {
          capturedPayload = payload;
          return {
            id: "gen-test-1",
            model: payload.model,
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Grounded clinical summary based on retrieved guidelines.",
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 35,
              completion_tokens: 12,
              total_tokens: 47,
            },
          };
        },
      };

      const adapter = new OpenRouterProviderAdapter(
        { apiKey: "sk-or-test", defaultModel: "meta-llama/llama-3.1-70b-instruct" },
        undefined,
        mockTransport
      );

      const messages = [
        { role: "system", content: "You are a clinical copilot." },
        { role: "user", content: "What is the first-line treatment for uncomplicated UTI?" },
      ];

      const result = await adapter.generateCompletion(messages, {
        temperature: 0.2,
        maxTokens: 500,
      });

      assert.strictEqual(result.provider, "openrouter");
      assert.strictEqual(result.model, "meta-llama/llama-3.1-70b-instruct");
      assert.strictEqual(result.text, "Grounded clinical summary based on retrieved guidelines.");
      assert.strictEqual(result.totalTokens, 47);

      // Verify captured payload matches OpenAI-compatible format expected by OpenRouter
      assert(capturedPayload !== null);
      assert.strictEqual(capturedPayload.model, "meta-llama/llama-3.1-70b-instruct");
      assert.strictEqual(capturedPayload.temperature, 0.2);
      assert.strictEqual(capturedPayload.max_tokens, 500);
      assert.strictEqual(capturedPayload.messages.length, 2);
      assert.strictEqual(capturedPayload.messages[0].role, "system");
      assert.strictEqual(capturedPayload.messages[1].role, "user");
    });

    // ------------------------------------------------------------------------
    // Scenario D: Streaming Support
    // ------------------------------------------------------------------------
    await test("Scenario D1: Tokens stream progressively and accumulate full result", async () => {
      const tokensEmitted = [];

      const mockTransport = {
        streamCompletion: async (payload, onToken) => {
          const streamTokens = ["First-line ", "therapy ", "includes ", "Nitrofurantoin."];
          for (const token of streamTokens) {
            onToken(token);
          }
          return {
            text: streamTokens.join(""),
            model: payload.model,
            provider: "openrouter",
            promptTokens: 10,
            completionTokens: 18,
            totalTokens: 28,
          };
        },
      };

      const adapter = new OpenRouterProviderAdapter(
        { apiKey: "sk-or-test", defaultModel: "openai/gpt-4o" },
        undefined,
        mockTransport
      );

      const result = await adapter.streamCompletion(
        [{ role: "user", content: "Summarize UTI treatment" }],
        (token) => tokensEmitted.push(token)
      );

      assert.strictEqual(tokensEmitted.length, 4);
      assert.strictEqual(tokensEmitted.join(""), "First-line therapy includes Nitrofurantoin.");
      assert.strictEqual(result.text, "First-line therapy includes Nitrofurantoin.");
      assert.strictEqual(result.provider, "openrouter");
      assert.strictEqual(result.model, "openai/gpt-4o");
    });

    await test("Scenario D2: Stream supports AbortSignal cancellation", async () => {
      const controller = new AbortController();

      const mockTransport = {
        streamCompletion: async (payload, onToken) => {
          if (payload.signal && payload.signal.aborted) {
            const err = new Error("Request aborted");
            err.name = "AbortError";
            throw err;
          }
          return { text: "ok", model: payload.model, provider: "openrouter", totalTokens: 1 };
        },
      };

      const adapter = new OpenRouterProviderAdapter(
        { apiKey: "sk-or-test", defaultModel: "openai/gpt-4o" },
        undefined,
        mockTransport
      );

      controller.abort();

      await assert.rejects(
        async () => {
          await adapter.streamCompletion(
            [{ role: "user", content: "test" }],
            () => {},
            { signal: controller.signal }
          );
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert(err.message.includes("aborted") || err.message.includes("cancelled"));
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // Scenario E: Model Configuration & Validation
    // ------------------------------------------------------------------------
    await test("Scenario E1: Arbitrary auto-routing model 'openrouter/auto' is rejected for clinical safety", async () => {
      assert.throws(
        () => {
          new OpenRouterProviderAdapter({
            apiKey: "sk-or-test",
            defaultModel: "openrouter/auto",
          });
        },
        (err) => {
          assert(err instanceof ConfigurationError);
          assert(err.message.includes("prohibited"));
          return true;
        }
      );
    });

    await test("Scenario E2: Incompatible non-tool/completion-only models are rejected", async () => {
      assert.throws(
        () => {
          new OpenRouterProviderAdapter({
            apiKey: "sk-or-test",
            defaultModel: "openai/o1-preview",
          });
        },
        (err) => {
          assert(err instanceof ConfigurationError);
          assert(err.message.includes("does not support") || err.message.includes("incompatible"));
          return true;
        }
      );
    });

    await test("Scenario E3: Explicit allowed models are accepted", async () => {
      const validModels = [
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "anthropic/claude-3.5-sonnet",
        "anthropic/claude-3-haiku",
        "meta-llama/llama-3.1-70b-instruct",
        "meta-llama/llama-3.3-70b-instruct",
        "google/gemini-2.0-flash-001",
        "deepseek/deepseek-chat",
      ];

      for (const m of validModels) {
        const adapter = new OpenRouterProviderAdapter({ apiKey: "sk-or-test", defaultModel: m });
        assert.strictEqual(adapter.getModelName(), m);
      }
    });

    // ------------------------------------------------------------------------
    // Scenario F: Tool Calling & Structured Output
    // ------------------------------------------------------------------------
    await test("Scenario F1: Tool calling definitions are formatted and parsed properly", async () => {
      let sentTools = null;

      const mockTransport = {
        chatCompletion: async (payload) => {
          sentTools = payload.tools;
          return {
            id: "call-1",
            model: payload.model,
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_abc123",
                      type: "function",
                      function: {
                        name: "searchMedicalCorpus",
                        arguments: JSON.stringify({ query: "diabetes guidelines 2024", topK: 3 }),
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
          };
        },
      };

      const adapter = new OpenRouterProviderAdapter(
        { apiKey: "sk-or-test", defaultModel: "openai/gpt-4o" },
        undefined,
        mockTransport
      );

      const tools = [
        {
          name: "searchMedicalCorpus",
          description: "Search clinical knowledge base for relevant guidelines",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
              topK: { type: "number" },
            },
            required: ["query"],
          },
        },
      ];

      const result = await adapter.generateCompletion(
        [{ role: "user", content: "Find guidelines on diabetes" }],
        { tools }
      );

      assert(sentTools !== null);
      assert.strictEqual(sentTools.length, 1);
      assert.strictEqual(sentTools[0].type, "function");
      assert.strictEqual(sentTools[0].function.name, "searchMedicalCorpus");

      assert(Array.isArray(result.toolCalls));
      assert.strictEqual(result.toolCalls.length, 1);
      assert.strictEqual(result.toolCalls[0].name, "searchMedicalCorpus");
      assert.deepStrictEqual(JSON.parse(result.toolCalls[0].arguments), {
        query: "diabetes guidelines 2024",
        topK: 3,
      });
    });

    // ------------------------------------------------------------------------
    // Scenario G: Usage Ledger & Metadata
    // ------------------------------------------------------------------------
    await test("Scenario G1: Completion results return complete metadata for usage ledger", async () => {
      const mockTransport = {
        chatCompletion: async (payload) => {
          return {
            id: "gen-usage-1",
            model: payload.model,
            choices: [{ message: { role: "assistant", content: "Result" } }],
            usage: { prompt_tokens: 15, completion_tokens: 10, total_tokens: 25 },
          };
        },
      };

      const adapter = new OpenRouterProviderAdapter(
        { apiKey: "sk-or-test", defaultModel: "anthropic/claude-3.5-sonnet" },
        undefined,
        mockTransport
      );

      const result = await adapter.generateCompletion([{ role: "user", content: "ping" }]);
      assert.strictEqual(result.provider, "openrouter");
      assert.strictEqual(result.model, "anthropic/claude-3.5-sonnet");
      assert.strictEqual(result.totalTokens, 25);
    });

    // ------------------------------------------------------------------------
    // Scenario H: Provider Failure & Healthcare Safety
    // ------------------------------------------------------------------------
    await test("Scenario H1: 401 Unauthorized maps to ProviderFailureError with no mock content", async () => {
      const mockTransport = {
        chatCompletion: async () => {
          const err = new Error("Invalid API key provided");
          err.status = 401;
          throw err;
        },
      };

      const adapter = new OpenRouterProviderAdapter(
        { apiKey: "sk-or-invalid", defaultModel: "openai/gpt-4o" },
        undefined,
        mockTransport
      );

      await assert.rejects(
        async () => {
          await adapter.generateCompletion([{ role: "user", content: "med question" }]);
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert.strictEqual(err.provider, "openrouter");
          assert(err.message.includes("401") || err.message.includes("authentication") || err.message.includes("API key"));
          return true;
        }
      );
    });

    await test("Scenario H2: 429 Rate Limit maps to ProviderFailureError", async () => {
      const mockTransport = {
        chatCompletion: async () => {
          const err = new Error("Rate limit reached on OpenRouter");
          err.status = 429;
          throw err;
        },
      };

      const adapter = new OpenRouterProviderAdapter(
        { apiKey: "sk-or-test", defaultModel: "openai/gpt-4o" },
        undefined,
        mockTransport
      );

      await assert.rejects(
        async () => {
          await adapter.generateCompletion([{ role: "user", content: "med question" }]);
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert.strictEqual(err.provider, "openrouter");
          assert(err.message.includes("429") || err.message.includes("rate limit"));
          return true;
        }
      );
    });

    await test("Scenario H3: 503 Provider Unavailable maps to ProviderFailureError", async () => {
      const mockTransport = {
        chatCompletion: async () => {
          const err = new Error("Upstream provider unavailable");
          err.status = 503;
          throw err;
        },
      };

      const adapter = new OpenRouterProviderAdapter(
        { apiKey: "sk-or-test", defaultModel: "openai/gpt-4o" },
        undefined,
        mockTransport
      );

      await assert.rejects(
        async () => {
          await adapter.generateCompletion([{ role: "user", content: "med question" }]);
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert.strictEqual(err.provider, "openrouter");
          assert(err.message.includes("503") || err.message.includes("unavailable"));
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // Scenario I: Embedding Continuity & Regression
    // ------------------------------------------------------------------------
    await test("Scenario I1: Embeddings are delegated preserving 1536d pgvector invariants", async () => {
      let delegatedSingleCalled = false;
      let delegatedBatchCalled = false;

      const mockEmbeddingDelegate = {
        providerName: "openai-embeddings-delegate",
        async generateCompletion() {
          throw new Error("Not implemented");
        },
        async streamCompletion() {
          throw new Error("Not implemented");
        },
        async generateEmbedding(text) {
          delegatedSingleCalled = true;
          return { embedding: new Array(1536).fill(0.01), dimension: 1536, model: "text-embedding-3-small" };
        },
        async generateBatchEmbeddings(texts) {
          delegatedBatchCalled = true;
          return texts.map(() => ({
            embedding: new Array(1536).fill(0.01),
            dimension: 1536,
            model: "text-embedding-3-small",
          }));
        },
      };

      const adapter = new OpenRouterProviderAdapter(
        { apiKey: "sk-or-test", defaultModel: "openai/gpt-4o" },
        mockEmbeddingDelegate
      );

      const singleRes = await adapter.generateEmbedding("clinical text");
      assert.strictEqual(singleRes.dimension, 1536);
      assert.strictEqual(singleRes.embedding.length, 1536);
      assert.strictEqual(delegatedSingleCalled, true);

      const batchRes = await adapter.generateBatchEmbeddings(["doc1", "doc2"]);
      assert.strictEqual(batchRes.length, 2);
      assert.strictEqual(batchRes[0].dimension, 1536);
      assert.strictEqual(batchRes[0].embedding.length, 1536);
      assert.strictEqual(delegatedBatchCalled, true);
    });

    await test("Scenario I2: Factory still selects OpenAI adapter when AI_PROVIDER=openai", async () => {
      process.env.AI_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "sk-mock-key-for-test";
      delete process.env.OPENROUTER_API_KEY;

      const provider = resolveAIProvider();
      assert(provider instanceof OpenAIProviderAdapter);
      assert.strictEqual(provider.providerName, "openai");
    });

    // -------------------------------------------------------------------------
    // J. Orchestrator Model Selection Preservation (No Hardcoded gpt-4o)
    // -------------------------------------------------------------------------
    await test("Scenario J1: Orchestrator passes undefined model, preserving OpenRouter configured model (e.g. gemma-4-31b-it:free)", async () => {
      const freeModel = "google/gemma-4-31b-it:free";
      const adapter = new OpenRouterProviderAdapter({
        apiKey: "sk-or-test-key",
        defaultModel: freeModel,
      });

      const capturedModels = [];
      adapter.setCustomTransport({
        async chatCompletion(params) {
          capturedModels.push(params.model);
          const isAuditor = params.messages.some((m) => m.content.includes("Auditor"));
          const content = isAuditor
            ? JSON.stringify({
                verifiedFacts: ["Fact 1 verified"],
                riskFlags: [],
                domainComplianceApproved: true,
                requiresHumanReview: false,
              })
            : JSON.stringify({
                extractedFacts: [{ statement: "Fact 1", chunkId: "c1", confidence: 0.95 }],
                relevantSections: ["Section 1"],
                dataCompleteness: "HIGH",
              });

          return {
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 15, completion_tokens: 20 },
          };
        },
        async streamCompletion(params, onToken) {
          capturedModels.push(params.model);
          onToken("streamed synthesis token");
          return {
            text: JSON.stringify({ synthesis: "Streamed answer", citations: [] }),
            promptTokens: 15,
            completionTokens: 20,
          };
        },
      });

      const mockDb = {
        saveRunStep: async (s) => ({ id: "step-1", ...s }),
        updateRunStep: async () => {},
        recordUsage: async () => {},
        updateRunStatus: async () => {},
        saveApprovalRequest: async () => ({ id: "app-1", status: "PENDING" }),
      };
      const mockRetriever = {
        retrieve: async () => ({
          chunks: [{ id: "c1", text: "Grounded evidence", page: 1, section: "1" }],
          rankedEvidence: [{ chunkId: "c1", content: "Grounded evidence", finalScore: 0.9, isRefusal: false }],
          citations: [{ citationIndex: 1, documentTitle: "Doc 1", versionNumber: 1, sectionNumber: "1", pageNumber: 1, chunkId: "c1", excerpt: "Grounded evidence" }],
          evidenceScores: [0.9],
          isRefusal: false,
          trace: { query: "test", candidateCount: 1, fusedResults: [{ chunkId: "c1", rrfScore: 0.03 }] },
        }),
      };
      const mockTools = {
        getToolsForAgent: () => [],
        getToolNamesForAgent: () => [],
        executeTool: async () => ({ outcome: {} }),
        setTwistPort: () => {},
      };
      const mockApproval = {
        createPendingApproval: async () => ({ id: "app-1", status: "PENDING" }),
      };
      const mockTwist = {
        twistName: "Test Twist",
        evaluateRiskGuard: () => ({ isPermitted: true, violations: [] }),
      };

      const orchestrator = new MultiAgentOrchestrator(
        mockDb,
        adapter,
        mockRetriever,
        mockTools,
        mockApproval,
        mockTwist
      );

      await orchestrator.runWorkflow(
        "run-test-openrouter",
        "What are the dosage rules?",
        "session-test",
        "corr-test",
        () => {}
      );

      assert(capturedModels.length > 0, "Orchestrator must invoke AI provider");
      assert(
        capturedModels.every((m) => m === freeModel),
        `All calls must use OpenRouter model '${freeModel}', but got: ${JSON.stringify(capturedModels)}`
      );
      assert(
        !capturedModels.includes("gpt-4o"),
        "Orchestrator must NEVER force 'gpt-4o' when using OpenRouter"
      );
    });

    await test("Scenario J2: Orchestrator preserves AI_MODEL when using OpenAI adapter", async () => {
      const customModel = "gpt-4o-2024-08-06";
      const adapter = new OpenAIProviderAdapter("sk-test-key", customModel);

      let capturedModel = null;
      adapter.client = {
        chat: {
          completions: {
            create: async (params) => {
              capturedModel = params.model;
              return {
                choices: [{ message: { content: "OK" } }],
                usage: { prompt_tokens: 5, completion_tokens: 5 },
              };
            },
          },
        },
      };

      // When options?.model is omitted, adapter defaults to customModel
      await adapter.generateCompletion([{ role: "user", content: "test" }], { temperature: 0.1 });
      assert.strictEqual(capturedModel, customModel);
    });

    await test("Scenario J3: Static check guarantees zero hardcoded 'gpt-4o' in orchestrator model-selection paths", async () => {
      const orchestratorSource = fs.readFileSync(
        path.resolve(__dirname, "../src/core/application/agents/orchestrator.service.ts"),
        "utf8"
      );

      assert(
        !orchestratorSource.includes('model: "gpt-4o"'),
        "orchestrator.service.ts must not contain { model: 'gpt-4o' }"
      );
      assert(
        !orchestratorSource.includes('options?.model || "gpt-4o"'),
        "orchestrator.service.ts must not default options?.model to 'gpt-4o'"
      );
    });
  } finally {
    // Restore environment
    process.env = originalEnv;
  }

  console.log("================================================================================");
  console.log(`OPENROUTER ADAPTER TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runOpenRouterTests().catch((err) => {
  console.error("FATAL ERROR in OpenRouter adapter test suite:", err);
  process.exit(1);
});
