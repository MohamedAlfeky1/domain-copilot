/**
 * DOMAIN COPILOT - OLLAMA AI PROVIDER ADAPTER DETERMINISTIC TEST SUITE
 *
 * Verifies the local Ollama LLM provider adapter in 100% offline, deterministic mode:
 * 1. Provider creation and default configuration (URL: http://localhost:11434, model: qwen3:8b)
 * 2. Model selection and validation (env OLLAMA_MODEL, options.model override, empty validation)
 * 3. Normal completion execution, response parsing, and token accounting
 * 4. Streaming completion via NDJSON chunks and token-by-token callbacks
 * 5. Tool calling definition formatting and Ollama tool_calls response parsing
 * 6. Connection refused / offline service error mapping to ProviderFailureError
 * 7. Model not found (404) error mapping with pull instructions
 * 8. Cancellation support via AbortSignal
 * 9. Malformed JSON response error handling
 * 10. Factory resolution with AI_PROVIDER=ollama
 * 11. Preservation of existing OpenAI and OpenRouter behavior
 * 12. Observability: zero cloud pricing ($0.00000) for local inference
 * 13. Embedding continuity: vector space delegation to 1536d provider
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

// Domain & Infrastructure imports
const {
  resolveAIProvider,
  createAIProvider,
  ConfigurationError,
  SUPPORTED_AI_PROVIDERS,
} = require("../src/infrastructure/ai/ai-provider.factory.ts");
const { OllamaProviderAdapter } = require("../src/infrastructure/ai/ollama.adapter.ts");
const { OpenAIProviderAdapter } = require("../src/infrastructure/ai/openai.adapter.ts");
const { OpenRouterProviderAdapter } = require("../src/infrastructure/ai/openrouter.adapter.ts");
const { ProviderFailureError } = require("../src/core/domain/errors.ts");

async function runOllamaTests() {
  console.log("================================================================================");
  console.log("OLLAMA LOCAL AI PROVIDER ADAPTER TEST SUITE");
  console.log("Verifying Ollama LLM completions, streaming, tool-calling, safety, and zero cost");
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

  const origEnv = { ...process.env };

  try {
    // ------------------------------------------------------------------------
    // Scenario 1: Provider Creation & Defaults
    // ------------------------------------------------------------------------
    await test("1.1 Default configuration sets baseUrl=http://localhost:11434, model=qwen3:8b, and think=false", () => {
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.OLLAMA_MODEL;
      delete process.env.OLLAMA_THINK;

      const adapter = new OllamaProviderAdapter();
      assert.strictEqual(adapter.providerName, "ollama");
      assert.strictEqual(adapter.getBaseUrl(), "http://localhost:11434");
      assert.strictEqual(adapter.getModelName(), "qwen3:8b");
      assert.strictEqual(adapter.getThink(), false, "think must default to false for fast inference");
    });

    await test("1.2 Custom config overrides baseUrl, defaultModel, and think", () => {
      const adapter = new OllamaProviderAdapter({
        baseUrl: "http://127.0.0.1:11435/",
        defaultModel: "qwen3:8b-instruct",
        think: true,
      });
      assert.strictEqual(adapter.getBaseUrl(), "http://127.0.0.1:11435"); // Trailing slash stripped
      assert.strictEqual(adapter.getModelName(), "qwen3:8b-instruct");
      assert.strictEqual(adapter.getThink(), true, "Custom config think: true must be honored");
    });

    await test("1.3 Empty model throws ConfigurationError", () => {
      assert.throws(
        () => new OllamaProviderAdapter({ defaultModel: "   " }),
        (err) => {
          assert(err instanceof ConfigurationError);
          assert(err.message.includes("Ollama model cannot be empty"));
          return true;
        }
      );
    });

    await test("1.4 OLLAMA_THINK environment variable controls default think behavior", () => {
      process.env.OLLAMA_THINK = "true";
      const adapterTrue = new OllamaProviderAdapter();
      assert.strictEqual(adapterTrue.getThink(), true);

      process.env.OLLAMA_THINK = "false";
      const adapterFalse = new OllamaProviderAdapter();
      assert.strictEqual(adapterFalse.getThink(), false);
      delete process.env.OLLAMA_THINK;
    });

    await test("1.5 Model residency keep_alive defaults to '30m' and can be overridden by config and OLLAMA_KEEP_ALIVE", () => {
      delete process.env.OLLAMA_KEEP_ALIVE;
      const defaultAdapter = new OllamaProviderAdapter();
      assert.strictEqual(defaultAdapter.getKeepAlive(), "30m");

      const customConfigAdapter = new OllamaProviderAdapter({ keepAlive: "1h" });
      assert.strictEqual(customConfigAdapter.getKeepAlive(), "1h");

      process.env.OLLAMA_KEEP_ALIVE = "45m";
      const envAdapter = new OllamaProviderAdapter();
      assert.strictEqual(envAdapter.getKeepAlive(), "45m");
      delete process.env.OLLAMA_KEEP_ALIVE;
    });

    // ------------------------------------------------------------------------
    // Scenario 2: Factory Selection & Model Selection
    // ------------------------------------------------------------------------
    await test("2.1 Factory resolves OllamaProviderAdapter when AI_PROVIDER=ollama", () => {
      process.env.AI_PROVIDER = "ollama";
      process.env.OLLAMA_BASE_URL = "http://localhost:11434";
      process.env.OLLAMA_MODEL = "qwen3:8b";

      const provider = resolveAIProvider();
      assert(provider instanceof OllamaProviderAdapter);
      assert.strictEqual(provider.providerName, "ollama");
      assert.strictEqual(provider.getModelName(), "qwen3:8b");
    });

    await test("2.2 Explicit createAIProvider('ollama') creates OllamaProviderAdapter with model", () => {
      const provider = createAIProvider({
        provider: "ollama",
        baseUrl: "http://localhost:11434",
        model: "qwen3:8b",
      });
      assert(provider instanceof OllamaProviderAdapter);
      assert.strictEqual(provider.providerName, "ollama");
    });

    await test("2.3 options.model parameter overrides default model in generateCompletion", async () => {
      let capturedModel = null;
      const mockTransport = {
        chat: async (params) => {
          capturedModel = params.model;
          return {
            message: { role: "assistant", content: "Clinical answer" },
            prompt_eval_count: 20,
            eval_count: 10,
          };
        },
      };

      const adapter = new OllamaProviderAdapter(
        { defaultModel: "qwen3:8b" },
        undefined,
        mockTransport
      );

      const res = await adapter.generateCompletion(
        [{ role: "user", content: "Triage protocol" }],
        { model: "qwen3:8b-custom-tuned" }
      );

      assert.strictEqual(capturedModel, "qwen3:8b-custom-tuned");
      assert.strictEqual(res.model, "qwen3:8b-custom-tuned");
    });

    // ------------------------------------------------------------------------
    // Scenario 3: Normal Completion & Token Accounting
    // ------------------------------------------------------------------------
    await test("3.1 generateCompletion returns text, token metrics, provider, and model", async () => {
      let capturedParams = null;
      const mockTransport = {
        chat: async (params) => {
          capturedParams = params;
          return {
            model: params.model,
            created_at: new Date().toISOString(),
            message: {
              role: "assistant",
              content: "First-line antibiotic for acute uncomplicated cystitis is Nitrofurantoin.",
            },
            done: true,
            prompt_eval_count: 45,
            eval_count: 25,
          };
        },
      };

      const adapter = new OllamaProviderAdapter(
        { defaultModel: "qwen3:8b" },
        undefined,
        mockTransport
      );

      const messages = [
        { role: "system", content: "You are a clinical decision support specialist." },
        { role: "user", content: "What is the recommended antibiotic for uncomplicated cystitis?" },
      ];

      const result = await adapter.generateCompletion(messages, {
        temperature: 0.2,
        maxTokens: 500,
      });

      assert.strictEqual(result.provider, "ollama");
      assert.strictEqual(result.model, "qwen3:8b");
      assert.strictEqual(
        result.text,
        "First-line antibiotic for acute uncomplicated cystitis is Nitrofurantoin."
      );
      assert.strictEqual(result.promptTokens, 45);
      assert.strictEqual(result.completionTokens, 25);
      assert.strictEqual(result.totalTokens, 70);

      // Verify payload sent to Ollama
      assert(capturedParams !== null);
      assert.strictEqual(capturedParams.model, "qwen3:8b");
      assert.strictEqual(capturedParams.think, false, "generateCompletion must send think: false by default");
      assert.strictEqual(capturedParams.keep_alive, "30m", "generateCompletion must send keep_alive: 30m");
      assert.strictEqual(capturedParams.options.temperature, 0.2);
      assert.strictEqual(capturedParams.options.num_predict, 500);
      assert.strictEqual(capturedParams.messages.length, 2);
      assert.strictEqual(capturedParams.messages[0].role, "system");
      assert.strictEqual(capturedParams.messages[1].role, "user");
    });

    await test("3.2 options.think overrides default think mode in generateCompletion", async () => {
      let capturedParams = null;
      const mockTransport = {
        chat: async (params) => {
          capturedParams = params;
          return {
            model: params.model,
            message: { role: "assistant", content: "OK" },
            prompt_eval_count: 10,
            eval_count: 5,
          };
        },
      };

      const adapter = new OllamaProviderAdapter({ defaultModel: "qwen3:8b" }, undefined, mockTransport);
      await adapter.generateCompletion([{ role: "user", content: "Test" }], { think: true });

      assert(capturedParams !== null);
      assert.strictEqual(capturedParams.think, true, "options.think: true must override default think: false");
    });

    // ------------------------------------------------------------------------
    // Scenario 4: Streaming Support
    // ------------------------------------------------------------------------
    await test("4.1 streamCompletion progressively emits tokens via onToken callback and sends think: false", async () => {
      const tokensEmitted = [];
      let capturedStreamParams = null;
      const mockTransport = {
        stream: async (params, onToken) => {
          capturedStreamParams = params;
          const chunks = ["Emergency ", "cardiac ", "triage ", "initiated."];
          for (const chunk of chunks) {
            onToken(chunk);
          }
          return {
            text: chunks.join(""),
            prompt_eval_count: 15,
            eval_count: 20,
            totalTokens: 35,
          };
        },
      };

      const adapter = new OllamaProviderAdapter(
        { defaultModel: "qwen3:8b" },
        undefined,
        mockTransport
      );

      const result = await adapter.streamCompletion(
        [{ role: "user", content: "Initiate cardiac triage" }],
        (token) => tokensEmitted.push(token)
      );

      assert.strictEqual(tokensEmitted.length, 4);
      assert.strictEqual(tokensEmitted.join(""), "Emergency cardiac triage initiated.");
      assert.strictEqual(result.text, "Emergency cardiac triage initiated.");
      assert.strictEqual(result.provider, "ollama");
      assert.strictEqual(result.model, "qwen3:8b");
      assert.strictEqual(result.totalTokens, 35);
      assert(capturedStreamParams !== null);
      assert.strictEqual(capturedStreamParams.think, false, "streamCompletion must send think: false by default");
      assert.strictEqual(capturedStreamParams.keep_alive, "30m", "streamCompletion must send keep_alive: 30m");
    });

    await test("4.2 options.think overrides default think mode in streamCompletion", async () => {
      let capturedStreamParams = null;
      const mockTransport = {
        stream: async (params, onToken) => {
          capturedStreamParams = params;
          onToken("chunk");
          return { text: "chunk", prompt_eval_count: 5, eval_count: 5, totalTokens: 10 };
        },
      };

      const adapter = new OllamaProviderAdapter({ defaultModel: "qwen3:8b" }, undefined, mockTransport);
      await adapter.streamCompletion([{ role: "user", content: "Stream test" }], () => {}, { think: true });

      assert(capturedStreamParams !== null);
      assert.strictEqual(capturedStreamParams.think, true, "options.think: true must override stream think default");
    });

    // ------------------------------------------------------------------------
    // Scenario 5: Tool Calling Mapping
    // ------------------------------------------------------------------------
    await test("5.1 Tool definitions are converted to Ollama function format and tool_calls parsed with think: false", async () => {
      let capturedTools = null;
      let capturedChatParams = null;
      const mockTransport = {
        chat: async (params) => {
          capturedChatParams = params;
          capturedTools = params.tools;
          return {
            model: params.model,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "call_qwen_12345",
                  function: {
                    name: "searchMedicalCorpus",
                    arguments: { query: "pediatric dosage amoxicillin", topK: 3 },
                  },
                },
              ],
            },
            done: true,
            prompt_eval_count: 60,
            eval_count: 30,
          };
        },
      };

      const adapter = new OllamaProviderAdapter(
        { defaultModel: "qwen3:8b" },
        undefined,
        mockTransport
      );

      const toolDefs = [
        {
          name: "searchMedicalCorpus",
          description: "Search clinical database for medication guidelines",
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
        [{ role: "user", content: "Find pediatric amoxicillin dosage" }],
        { tools: toolDefs }
      );

      // Verify think: false sent with tool-calling
      assert(capturedChatParams !== null);
      assert.strictEqual(capturedChatParams.think, false, "Tool calling request must send think: false");

      // Verify tool definition passed to Ollama format
      assert(Array.isArray(capturedTools));
      assert.strictEqual(capturedTools.length, 1);
      assert.strictEqual(capturedTools[0].type, "function");
      assert.strictEqual(capturedTools[0].function.name, "searchMedicalCorpus");
      assert.strictEqual(
        capturedTools[0].function.description,
        "Search clinical database for medication guidelines"
      );

      // Verify parsed ToolCallRequest matches IAIProviderPort contract
      assert(Array.isArray(result.toolCalls));
      assert.strictEqual(result.toolCalls.length, 1);
      assert.strictEqual(result.toolCalls[0].id, "call_qwen_12345");
      assert.strictEqual(result.toolCalls[0].name, "searchMedicalCorpus");
      assert.strictEqual(typeof result.toolCalls[0].arguments, "string");

      const parsedArgs = JSON.parse(result.toolCalls[0].arguments);
      assert.strictEqual(parsedArgs.query, "pediatric dosage amoxicillin");
      assert.strictEqual(parsedArgs.topK, 3);
    });

    await test("5.2 Multi-turn conversation preserves tool role and tool_call_id", async () => {
      let capturedMessages = null;
      const mockTransport = {
        chat: async (params) => {
          capturedMessages = params.messages;
          return {
            message: { role: "assistant", content: "Dosage is 45 mg/kg/day divided q12h." },
            prompt_eval_count: 80,
            eval_count: 40,
          };
        },
      };

      const adapter = new OllamaProviderAdapter(
        { defaultModel: "qwen3:8b" },
        undefined,
        mockTransport
      );

      const messages = [
        { role: "user", content: "Find dosage" },
        { role: "assistant", content: "" },
        {
          role: "tool",
          content: JSON.stringify({ guideline: "Amoxicillin: 45 mg/kg/day" }),
          toolCallId: "call_qwen_12345",
        },
      ];

      const res = await adapter.generateCompletion(messages);
      assert.strictEqual(res.text, "Dosage is 45 mg/kg/day divided q12h.");
      assert.strictEqual(capturedMessages.length, 3);
      assert.strictEqual(capturedMessages[2].role, "tool");
      assert.strictEqual(capturedMessages[2].tool_call_id, "call_qwen_12345");
    });

    // ------------------------------------------------------------------------
    // Scenario 6: Timeout and Error Handling
    // ------------------------------------------------------------------------
    await test("6.1 Connection refused / offline Ollama maps to ProviderFailureError with clear message", async () => {
      const mockTransport = {
        chat: async () => {
          const err = new Error("connect ECONNREFUSED 127.0.0.1:11434");
          err.code = "ECONNREFUSED";
          throw err;
        },
      };

      const adapter = new OllamaProviderAdapter(
        { defaultModel: "qwen3:8b" },
        undefined,
        mockTransport
      );

      await assert.rejects(
        async () => {
          await adapter.generateCompletion([{ role: "user", content: "Query" }]);
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert.strictEqual(err.provider, "ollama");
          assert(err.message.includes("Ollama service unavailable"));
          assert(err.message.includes("http://localhost:11434"));
          return true;
        }
      );
    });

    await test("6.2 Model not found (404) maps to ProviderFailureError with pull instruction", async () => {
      const mockTransport = {
        chat: async () => {
          const err = new Error("model 'nonexistent:8b' not found");
          err.status = 404;
          throw err;
        },
      };

      const adapter = new OllamaProviderAdapter(
        { defaultModel: "nonexistent:8b" },
        undefined,
        mockTransport
      );

      await assert.rejects(
        async () => {
          await adapter.generateCompletion([{ role: "user", content: "Query" }]);
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert.strictEqual(err.provider, "ollama");
          assert(err.message.includes("not found"));
          assert(err.message.includes("ollama pull nonexistent:8b"));
          return true;
        }
      );
    });

    await test("6.3 Timeout error maps to ProviderFailureError", async () => {
      const mockTransport = {
        chat: async () => {
          const err = new Error("Request timed out");
          err.code = "ETIMEDOUT";
          throw err;
        },
      };

      const adapter = new OllamaProviderAdapter(
        { defaultModel: "qwen3:8b" },
        undefined,
        mockTransport
      );

      await assert.rejects(
        async () => {
          await adapter.generateCompletion([{ role: "user", content: "Query" }]);
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert.strictEqual(err.provider, "ollama");
          assert(err.message.includes("timed out"));
          return true;
        }
      );
    });

    await test("6.4 Zero fake/mock clinical responses returned on Ollama failure", async () => {
      const mockTransport = {
        chat: async () => {
          throw new Error("Ollama daemon crashed");
        },
      };

      const adapter = new OllamaProviderAdapter(
        { defaultModel: "qwen3:8b" },
        undefined,
        mockTransport
      );

      await assert.rejects(
        async () => {
          await adapter.generateCompletion([{ role: "user", content: "Verify cardiac emergency" }]);
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          // Verify it did NOT return any synthetic clinical text
          assert(!err.message.includes("verifiedFacts"));
          assert(!err.message.includes("Dosage protocols cross-referenced"));
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // Scenario 7: Cancellation Support
    // ------------------------------------------------------------------------
    await test("7.1 Stream supports AbortSignal cancellation and throws ProviderFailureError", async () => {
      const controller = new AbortController();
      const mockTransport = {
        stream: async (params, _onToken) => {
          if (params.signal && params.signal.aborted) {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            throw err;
          }
          return { text: "aborted text" };
        },
      };

      const adapter = new OllamaProviderAdapter(
        { defaultModel: "qwen3:8b" },
        undefined,
        mockTransport
      );

      controller.abort();

      await assert.rejects(
        async () => {
          await adapter.streamCompletion(
            [{ role: "user", content: "Stream test" }],
            () => {},
            { signal: controller.signal }
          );
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert.strictEqual(err.provider, "ollama");
          assert(err.message.includes("cancelled") || err.message.includes("aborted"));
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // Scenario 8: Malformed Response Handling
    // ------------------------------------------------------------------------
    await test("8.1 Malformed response maps to ProviderFailureError", async () => {
      const mockTransport = {
        chat: async () => {
          const err = new SyntaxError("Unexpected token < in JSON at position 0");
          throw err;
        },
      };

      const adapter = new OllamaProviderAdapter(
        { defaultModel: "qwen3:8b" },
        undefined,
        mockTransport
      );

      await assert.rejects(
        async () => {
          await adapter.generateCompletion([{ role: "user", content: "Query" }]);
        },
        (err) => {
          assert(err instanceof ProviderFailureError);
          assert.strictEqual(err.provider, "ollama");
          assert(err.message.includes("malformed") || err.message.includes("Unexpected token"));
          return true;
        }
      );
    });

    // ------------------------------------------------------------------------
    // Scenario 9: Non-Regression & Embedding Continuity
    // ------------------------------------------------------------------------
    await test("9.1 Factory preserves OpenAI adapter when AI_PROVIDER=openai", () => {
      process.env.AI_PROVIDER = "openai";
      const provider = resolveAIProvider();
      assert.strictEqual(provider.providerName, "openai");
      assert(provider instanceof OpenAIProviderAdapter);
    });

    await test("9.2 Factory preserves OpenRouter adapter when AI_PROVIDER=openrouter", () => {
      process.env.AI_PROVIDER = "openrouter";
      process.env.OPENROUTER_API_KEY = "sk-or-valid-test-key";
      const provider = resolveAIProvider();
      assert.strictEqual(provider.providerName, "openrouter");
      assert(provider instanceof OpenRouterProviderAdapter);
    });

    await test("9.3 Embeddings are delegated preserving 1536d pgvector compatibility", async () => {
      let embeddingCalled = false;
      const mockEmbeddingDelegate = {
        providerName: "gemini",
        generateEmbedding: async (text) => {
          embeddingCalled = true;
          return { embedding: new Array(1536).fill(0.01), dimension: 1536, model: "gemini-embedding-001" };
        },
        generateBatchEmbeddings: async (texts) => {
          return texts.map(() => ({
            embedding: new Array(1536).fill(0.01),
            dimension: 1536,
            model: "gemini-embedding-001",
          }));
        },
        generateCompletion: async () => ({ text: "", promptTokens: 0, completionTokens: 0, totalTokens: 0, model: "" }),
        streamCompletion: async () => ({ text: "", promptTokens: 0, completionTokens: 0, totalTokens: 0, model: "" }),
      };

      const adapter = new OllamaProviderAdapter({ defaultModel: "qwen3:8b" }, mockEmbeddingDelegate);
      const emb = await adapter.generateEmbedding("clinical text");

      assert.strictEqual(embeddingCalled, true);
      assert.strictEqual(emb.dimension, 1536);
      assert.strictEqual(emb.embedding.length, 1536);
    });

    await test("9.4 OpenAI and OpenRouter adapters are unchanged and provider contracts are preserved", () => {
      const openai = new OpenAIProviderAdapter("sk-test-key", "gpt-4o", "text-embedding-3-small");
      assert.strictEqual(openai.providerName, "openai");
      assert.strictEqual(openai.defaultModel, "gpt-4o");
      assert.strictEqual((openai).think, undefined);

      const openrouter = new OpenRouterProviderAdapter({
        apiKey: "sk-or-test",
        defaultModel: "openai/gpt-4o",
      });
      assert.strictEqual(openrouter.providerName, "openrouter");
      assert.strictEqual(openrouter.getModelName(), "openai/gpt-4o");
      assert.strictEqual((openrouter).think, undefined);
    });

    // ------------------------------------------------------------------------
    // Scenario 10: Zero-Cost Observability Accounting
    // ------------------------------------------------------------------------
    await test("10.1 Ollama calculateCost returns exactly 0 for local offline inference", () => {
      const adapter = new OllamaProviderAdapter();
      const cost = adapter.calculateCost(5000, 2000);
      assert.strictEqual(cost, 0, "Local Ollama inference must have zero dollar cost");
    });

  } finally {
    process.env = origEnv;
  }

  console.log("================================================================================");
  console.log(`OLLAMA ADAPTER TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runOllamaTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
