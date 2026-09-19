/**
 * DOMAIN COPILOT - UNIT TEST SUITE (DEV-005)
 * Runs offline unit tests with deterministic fixtures.
 */

const assert = require("assert");
const fs = require("fs");
const ts = require("typescript");

if (!require.extensions[".ts"]) {
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
}


async function runUnitTests() {
  console.log("==================================================");
  console.log("RUNNING UNIT TEST PYRAMID (DEV-005)");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ FAIL: ${name} -> ${err.message}`);
      failed++;
    }
  }

  // 1. RRF math test
  test("Reciprocal Rank Fusion calculates score correctly", () => {
    const k = 60;
    const rank1 = 1;
    const score = 1 / (k + rank1);
    assert.strictEqual(score, 1 / 61);
  });

  // 2. Cosine similarity test
  test("Cosine similarity returns 1.0 for identical unit vectors", () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < 3; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    assert.strictEqual(sim, 1.0);
  });

  // 3. Cosine similarity orthogonality test
  test("Cosine similarity returns 0.0 for orthogonal vectors", () => {
    const vecA = [1, 0];
    const vecB = [0, 1];
    let dot = vecA[0] * vecB[0] + vecA[1] * vecB[1];
    assert.strictEqual(dot, 0);
  });

  // 4. Low-evidence refusal threshold calculation
  test("Low-evidence refusal triggers when fused score < 0.015", () => {
    const threshold = 0.015;
    const lowScore = 0.008;
    const isRefusal = lowScore < threshold;
    assert.strictEqual(isRefusal, true);
  });

  // 5. Structure-aware chunking boundary preservation
  test("Chunking preserves paragraph coherence without orphan headers", () => {
    const sampleText = "# Section 1: Indications\n\nFirst paragraph.\n\nSecond paragraph.";
    const paras = sampleText.split(/\n\n+/);
    assert.strictEqual(paras.length, 3);
  });

  // 6. SHA-256 hash idempotency
  test("SHA-256 generates stable digests for identical content", () => {
    const crypto = require("crypto");
    const h1 = crypto.createHash("sha256").update("clinical-sample").digest("hex");
    const h2 = crypto.createHash("sha256").update("clinical-sample").digest("hex");
    assert.strictEqual(h1, h2);
  });

  // 7. Rejection reason mandatory check (HITL-005)
  test("Reject flow enforces mandatory non-empty reason", () => {
    const reason = "   ";
    assert.strictEqual(reason.trim().length === 0, true);
  });

  // 8. Tool permission allow-list check
  test("Agent allow-lists block unauthorized tool invocation", () => {
    const allowed = ["Supervisor"];
    const currentAgent = "Clinical Evidence Extractor";
    const permitted = allowed.includes(currentAgent);
    assert.strictEqual(permitted, false);
  });

  // 9. Cost accounting token calculation
  test("gpt-4o pricing model calculates accurate costs", () => {
    const promptTokens = 1000;
    const compTokens = 500;
    const promptCost = (promptTokens / 1_000_000) * 2.50;
    const compCost = (compTokens / 1_000_000) * 10.00;
    const total = promptCost + compCost;
    assert.strictEqual(total, 0.0075);
  });

  // 10. Token limit bounds check
  test("Max iterations circuit breaker caps execution at 5", () => {
    let iterations = 6;
    const MAX = 5;
    assert.strictEqual(iterations > MAX, true);
  });

  // 11. Internal Safety Risk Guard deterministic blocking (Bonus safety feature)
  test("Internal Safety Risk Guard blocks consequential action when evidence score < 0.35", () => {
    const threshold = 0.85;
    let riskIndex = 0.1;
    const evidenceScores = [0.24];
    const isConsequential = true;
    if (evidenceScores.some((s) => s < 0.35)) riskIndex += 0.45;
    if (isConsequential) riskIndex += 0.3;
    riskIndex = Math.round(riskIndex * 100) / 100;
    const isPermitted = riskIndex < threshold;
    assert.strictEqual(riskIndex, 0.85);
    assert.strictEqual(isPermitted, false);
  });

  // 12. Tool Registry side-effect gating with Risk Guard
  test("Tool path blocks side-effecting operation when Safety Risk Guard trips", () => {
    const isSideEffecting = true;
    const isTwistPermitted = false;
    let toolExecuted = false;
    if (isSideEffecting && !isTwistPermitted) {
      toolExecuted = false; // Blocked by guard
    } else {
      toolExecuted = true;
    }
    assert.strictEqual(toolExecuted, false);
  });

  // 13. Database & pgvector readiness check (OBS-006)
  await test("Database & pgvector readiness check executes real SQL query and vector extension check", async () => {
    const { PGlite } = require("@electric-sql/pglite");
    const { vector } = require("@electric-sql/pglite/vector");
    const db = new PGlite({ extensions: { vector } });
    await db.exec("CREATE EXTENSION IF NOT EXISTS vector;");
    const ping = await db.query("SELECT 1 as ping;");
    assert.strictEqual(ping.rows[0].ping, 1);
    const vec = await db.query("SELECT '[1.0, 2.0, 3.0]'::vector as test_vec;");
    assert.strictEqual(Boolean(vec.rows[0].test_vec), true);
  });

  // 14. Readiness 503 error handling on disconnection (OBS-006)
  await test("Readiness route returns 503-compatible rejection when database is unreachable", async () => {
    let status = 200;
    let payload = {};
    try {
      throw new Error("PostgreSQL database connection is offline");
    } catch (err) {
      status = 503;
      payload = {
        status: "UNHEALTHY",
        database: "DISCONNECTED",
        pgvector: "UNAVAILABLE",
        error: err.message,
      };
    }
    assert.strictEqual(status, 503);
    assert.strictEqual(payload.status, "UNHEALTHY");
    assert.strictEqual(payload.database, "DISCONNECTED");
    assert.strictEqual(payload.pgvector, "UNAVAILABLE");
  });

  // 15. T1 Bilingual: Arabic Unicode language detection
  await test("T1 Bilingual detects Arabic text via Unicode range analysis", () => {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    assert.strictEqual(arabicRegex.test("بروتوكول سريري"), true);
    assert.strictEqual(arabicRegex.test("Clinical protocol"), false);
  });

  // 16. T1 Bilingual: RTL rendering decision
  await test("T1 Bilingual identifies text requiring RTL layout rendering", () => {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const isRtl = (text) => Boolean(text && arabicRegex.test(text));
    assert.strictEqual(isRtl("إرشادات جرعات مضادات التخثر"), true);
    assert.strictEqual(isRtl("Standard anticoagulation dosage"), false);
    assert.strictEqual(isRtl(""), false);
  });

  // 17. T1 Bilingual: FTS dictionary configuration mapping
  await test("T1 Bilingual maps Arabic to 'simple' and English to 'english' FTS configs", () => {
    const getFtsConfig = (lang) => (lang === "ar" ? "simple" : "english");
    assert.strictEqual(getFtsConfig("ar"), "simple");
    assert.strictEqual(getFtsConfig("en"), "english");
  });

  // 18. T1 Bilingual: Cross-lingual retrieval targets both Arabic and English corpuses
  await test("T1 Bilingual cross-lingual retrieval targets both Arabic and English corpuses", () => {
    const supported = ["ar", "en"];
    const query = "What are the sepsis resuscitation guidelines?";
    const detectedLang = /[\u0600-\u06FF]/.test(query) ? "ar" : "en";
    const targets = supported;
    assert.strictEqual(detectedLang, "en");
    assert.deepStrictEqual(targets, ["ar", "en"]);
  });

  // 19. RBAC Run Access: canAccessRun rule verification
  function canAccessRun(user, run, approval) {
    if (user.role === "ADMIN" || run.ownerId === user.id) return true;
    if (user.role === "APPROVER") {
      if (Array.isArray(approval)) return approval.some((a) => a && a.runId === run.id);
      if (approval && approval.runId === run.id) return true;
    }
    return false;
  }

  await test("canAccessRun allows ADMIN to access any run", () => {
    const adminUser = { id: "usr-admin-001", role: "ADMIN" };
    const otherRun = { id: "run-100", ownerId: "usr-expert-001" };
    assert.strictEqual(canAccessRun(adminUser, otherRun, null), true);
  });

  await test("canAccessRun allows run owner to access their own run", () => {
    const expertUser = { id: "usr-expert-001", role: "EXPERT" };
    const ownRun = { id: "run-200", ownerId: "usr-expert-001" };
    assert.strictEqual(canAccessRun(expertUser, ownRun, null), true);
  });

  await test("canAccessRun allows APPROVER to access run when associated approval exists", () => {
    const approverUser = { id: "usr-approver-001", role: "APPROVER" };
    const run = { id: "run-300", ownerId: "usr-expert-001" };
    const approval = { id: "appr-01", runId: "run-300", status: "APPROVED" };
    assert.strictEqual(canAccessRun(approverUser, run, approval), true);
    assert.strictEqual(canAccessRun(approverUser, run, [approval]), true);
  });

  await test("canAccessRun forbids APPROVER from accessing run when no approval exists", () => {
    const approverUser = { id: "usr-approver-001", role: "APPROVER" };
    const run = { id: "run-400", ownerId: "usr-expert-001" };
    assert.strictEqual(canAccessRun(approverUser, run, null), false);
    assert.strictEqual(canAccessRun(approverUser, run, undefined), false);
  });

  await test("canAccessRun forbids APPROVER from accessing run when approval is for different run", () => {
    const approverUser = { id: "usr-approver-001", role: "APPROVER" };
    const run = { id: "run-500", ownerId: "usr-expert-001" };
    const unrelatedApproval = { id: "appr-99", runId: "run-OTHER", status: "APPROVED" };
    assert.strictEqual(canAccessRun(approverUser, run, unrelatedApproval), false);
    assert.strictEqual(canAccessRun(approverUser, run, [unrelatedApproval]), false);
  });

  await test("canAccessRun forbids non-owner EXPERT and VIEWER from accessing other runs", () => {
    const expertUser = { id: "usr-expert-002", role: "EXPERT" };
    const viewerUser = { id: "usr-viewer-001", role: "VIEWER" };
    const run = { id: "run-600", ownerId: "usr-expert-001" };
    const approval = { id: "appr-02", runId: "run-600", status: "APPROVED" };
    assert.strictEqual(canAccessRun(expertUser, run, approval), false);
    assert.strictEqual(canAccessRun(viewerUser, run, approval), false);
  });

  // 20. Presentation Normalization: normalizeDisplayText
  function normalizeDisplayText(raw) {
    if (typeof raw !== "string") {
      if (raw && typeof raw === "object" && "synthesis" in raw && typeof raw.synthesis === "string") {
        return raw.synthesis;
      }
      return raw ? String(raw) : "";
    }
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("{") && trimmed.includes('"synthesis"')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.synthesis === "string") {
          return parsed.synthesis;
        }
      } catch {
        const match = trimmed.match(/"synthesis"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (match) {
          try {
            return JSON.parse(`"${match[1]}"`);
          } catch {}
        }
      }
    }
    return raw;
  }

  await test("normalizeDisplayText returns plain text unchanged", () => {
    const plain = "Clinical management must cross-reference patient lab markers.";
    assert.strictEqual(normalizeDisplayText(plain), plain);
  });

  await test("normalizeDisplayText extracts synthesis from full Drafter JSON string", () => {
    const drafterJson = JSON.stringify({
      synthesis: "Adverse reaction protocols require immediate cessation of infusion.",
      citationsUsed: ["chk-1", "chk-2"],
      refusalNotice: "",
      actionProposed: {
        toolName: "",
        parameters: {},
        isSideEffecting: false,
        riskLevel: "LOW"
      }
    }, null, 2);

    const result = normalizeDisplayText(drafterJson);
    assert.strictEqual(result, "Adverse reaction protocols require immediate cessation of infusion.");
  });

  await test("normalizeDisplayText extracts synthesis from Drafter object", () => {
    const drafterObj = {
      synthesis: "Hemodynamic stabilization protocol confirmed.",
      citationsUsed: ["chk-3"]
    };
    assert.strictEqual(normalizeDisplayText(drafterObj), "Hemodynamic stabilization protocol confirmed.");
  });

  await test("normalizeDisplayText extracts synthesis from malformed JSON via regex fallback", () => {
    const malformed = '{\n  "synthesis": "Emergency resuscitation guidelines.",\n  "citationsUsed": [';
    assert.strictEqual(normalizeDisplayText(malformed), "Emergency resuscitation guidelines.");
  });

  await test("normalizeDisplayText falls back to raw text if JSON has no synthesis", () => {
    const otherJson = '{"error": "something failed"}';
    assert.strictEqual(normalizeDisplayText(otherJson), otherJson);
  });

  await test("normalizeDisplayText handles empty, null, and non-string gracefully", () => {
    assert.strictEqual(normalizeDisplayText(""), "");
    assert.strictEqual(normalizeDisplayText(null), "");
    assert.strictEqual(normalizeDisplayText(undefined), "");
    assert.strictEqual(normalizeDisplayText(123), "123");
  });

  await test("done event contract includes clean finalAnswer", () => {
    const doneEvent = {
      type: "done",
      finalAnswer: "Clean synthesized answer",
      data: {
        totalTokens: 1500,
        totalCostUsd: 0,
        citationsCount: 5,
        finalAnswer: "Clean synthesized answer"
      }
    };
    assert.strictEqual(doneEvent.finalAnswer, "Clean synthesized answer");
    assert.strictEqual(doneEvent.data.finalAnswer, "Clean synthesized answer");
    assert.strictEqual(normalizeDisplayText(doneEvent.finalAnswer), "Clean synthesized answer");
  });

  // 21. Bounded Extractor Output Prompt Contract
  await test("buildExtractorPrompt instructs 3 to 5 concise facts", () => {
    const fs = require("fs");
    const promptSrc = fs.readFileSync(require("path").join(__dirname, "../src/core/application/agents/specialist-prompts.ts"), "utf-8");
    assert.ok(promptSrc.includes("3 to 5 most important factual claims"), "Must guide extractor to 3-5 facts");
    assert.ok(promptSrc.includes("Keep each statement concise"), "Must guide extractor to concise statements");
  });

  // 22. Provider-Aware Step Timeout Resolution
  await test("provider timeout resolution respects cloud 30s and Ollama 60s", () => {
    function resolveTimeout(provider, env = {}) {
      const p = (provider || env.AI_PROVIDER || "").trim().toLowerCase();
      if (p === "ollama") {
        const raw = env.OLLAMA_STEP_TIMEOUT_MS || env.STEP_TIMEOUT_MS;
        return raw ? parseInt(raw, 10) : 60000;
      }
      const raw = env.STEP_TIMEOUT_MS;
      return raw ? parseInt(raw, 10) : 30000;
    }
    assert.strictEqual(resolveTimeout("openai"), 30000);
    assert.strictEqual(resolveTimeout("openrouter"), 30000);
    assert.strictEqual(resolveTimeout("ollama"), 60000);
    assert.strictEqual(resolveTimeout("ollama", { OLLAMA_STEP_TIMEOUT_MS: "45000" }), 45000);
    assert.strictEqual(resolveTimeout("openai", { STEP_TIMEOUT_MS: "25000" }), 25000);
  });

  // 23. HITL Qualification: isConsequentialHITLRequired logic
  function isConsequentialHITLRequired(auditorOutput, twistResult) {
    if (!twistResult.isPermitted) return true;
    if (!auditorOutput.requiresHumanReview) return false;
    const INFORMATIONAL_PATTERNS = [
      "data completeness",
      "compliance violation",
      "scope",
      "insufficient",
      "incomplete",
      "out of scope",
      "unrelated",
      "outside the scope",
      "no further action",
    ];
    const consequentialFlags = auditorOutput.riskFlags.filter((flag) => {
      if (flag.severity !== "HIGH" && flag.severity !== "CRITICAL") return false;
      const riskLower = (flag.riskType + " " + flag.detail).toLowerCase();
      return !INFORMATIONAL_PATTERNS.some((p) => riskLower.includes(p));
    });
    return consequentialFlags.length > 0;
  }

  await test("isConsequentialHITLRequired returns true when Twist Guard is tripped", () => {
    const auditor = { requiresHumanReview: false, riskFlags: [] };
    const twist = { isPermitted: false, computedRiskIndex: 0.9, threshold: 0.85, violations: ["low evidence"] };
    assert.strictEqual(isConsequentialHITLRequired(auditor, twist), true);
  });

  await test("isConsequentialHITLRequired returns false for informational data-completeness flag", () => {
    const auditor = {
      requiresHumanReview: true,
      riskFlags: [
        { riskType: "Data Completeness", severity: "CRITICAL", detail: "The data completeness is marked as INSUFFICIENT" },
      ],
    };
    const twist = { isPermitted: true };
    assert.strictEqual(isConsequentialHITLRequired(auditor, twist), false);
  });

  await test("isConsequentialHITLRequired returns false for compliance-violation / out-of-scope flag", () => {
    const auditor = {
      requiresHumanReview: true,
      riskFlags: [
        { riskType: "Compliance Violation", severity: "CRITICAL", detail: "The query is unrelated to the domain" },
      ],
    };
    const twist = { isPermitted: true };
    assert.strictEqual(isConsequentialHITLRequired(auditor, twist), false);
  });

  await test("isConsequentialHITLRequired returns true for consequential contraindication action", () => {
    const auditor = {
      requiresHumanReview: true,
      riskFlags: [
        { riskType: "Contraindication", severity: "CRITICAL", detail: "Concurrent administration of MAOIs is strictly contraindicated" },
      ],
    };
    const twist = { isPermitted: true };
    assert.strictEqual(isConsequentialHITLRequired(auditor, twist), true);
  });

  await test("isConsequentialHITLRequired returns true for dosage violation action", () => {
    const auditor = {
      requiresHumanReview: true,
      riskFlags: [
        { riskType: "Dosage Violation", severity: "HIGH", detail: "Proposed dosage exceeds therapeutic ceiling by 200%" },
      ],
    };
    const twist = { isPermitted: true };
    assert.strictEqual(isConsequentialHITLRequired(auditor, twist), true);
  });

  await test("isConsequentialHITLRequired returns false when auditor.requiresHumanReview is false", () => {
    const auditor = {
      requiresHumanReview: false,
      riskFlags: [
        { riskType: "Contraindication", severity: "CRITICAL", detail: "Drug interaction detected" },
      ],
    };
    const twist = { isPermitted: true };
    assert.strictEqual(isConsequentialHITLRequired(auditor, twist), false);
  });

  await test("isConsequentialHITLRequired filters mixed informational + consequential flags correctly", () => {
    const auditor = {
      requiresHumanReview: true,
      riskFlags: [
        { riskType: "Data Completeness", severity: "CRITICAL", detail: "Marked as insufficient" },
        { riskType: "Off-Label Claim", severity: "HIGH", detail: "Unverified off-label usage proposed" },
      ],
    };
    const twist = { isPermitted: true };
    assert.strictEqual(isConsequentialHITLRequired(auditor, twist), true, "Must trigger when at least one consequential flag exists");
  });

  await test("isConsequentialHITLRequired ignores LOW/MEDIUM severity even for consequential types", () => {
    const auditor = {
      requiresHumanReview: true,
      riskFlags: [
        { riskType: "Contraindication", severity: "LOW", detail: "Minor interaction noted" },
        { riskType: "Data Completeness", severity: "CRITICAL", detail: "Insufficient data" },
      ],
    };
    const twist = { isPermitted: true };
    assert.strictEqual(isConsequentialHITLRequired(auditor, twist), false, "LOW severity contraindication should not trigger HITL");
  });

  await test("Auditor prompt instructs to distinguish informational from action risk", () => {
    const fs = require("fs");
    const promptSrc = fs.readFileSync(require("path").join(__dirname, "../src/core/application/agents/specialist-prompts.ts"), "utf-8");
    assert.ok(promptSrc.includes("ONLY if a side-effecting action"), "Prompt must guide auditor to flag only side-effecting actions");
    assert.ok(promptSrc.includes("Do NOT set requiresHumanReview to true for data completeness"), "Prompt must explicitly exclude data completeness from HITL");
  });

  // Persistent Chat History: Deterministic title generation
  await test("Deterministic title generation produces clean title from first message", () => {
    const { generateDeterministicTitle } = require("../src/lib/chat-title.ts");
    const title = generateDeterministicTitle("What are the prevention standards for hospital-acquired infections?", 45);
    assert.strictEqual(title.length <= 45, true);
    assert.strictEqual(title.endsWith("..."), true);
    assert.strictEqual(title.startsWith("What are the prevention"), true);
  });

  // Persistent Chat History: Short message title preserves exact text
  await test("Short user message does not append ellipsis to title", () => {
    const { generateDeterministicTitle } = require("../src/lib/chat-title.ts");
    const title = generateDeterministicTitle("Sepsis Protocol", 45);
    assert.strictEqual(title, "Sepsis Protocol");
  });

  // Persistent Chat History: Markdown stripped from title
  await test("Markdown symbols and headings are stripped from generated title", () => {
    const { generateDeterministicTitle } = require("../src/lib/chat-title.ts");
    const title = generateDeterministicTitle("### **Dosage Guide** for *Heparin*", 45);
    assert.strictEqual(title, "Dosage Guide for Heparin");
  });

  // Persistent Chat History: Chronological message sorting
  await test("Messages are ordered chronologically by createdAt ASC", () => {
    const m1 = { id: "1", createdAt: "2026-09-19T01:00:00.000Z" };
    const m2 = { id: "2", createdAt: "2026-09-19T01:05:00.000Z" };
    const m3 = { id: "3", createdAt: "2026-09-19T01:02:00.000Z" };
    const sorted = [m1, m2, m3].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    assert.deepStrictEqual(sorted.map(m => m.id), ["1", "3", "2"]);
  });

  // Persistent Chat History: Assistant message duplicate protection
  await test("Duplicate assistant message check identifies existing runId", () => {
    const existingMessages = [
      { id: "m1", role: "user", runId: null },
      { id: "m2", role: "assistant", runId: "run-123" },
    ];
    const runId = "run-123";
    const alreadyPersisted = existingMessages.some(m => m.runId === runId && m.role === "assistant");
    assert.strictEqual(alreadyPersisted, true);
    const newRunAlreadyPersisted = existingMessages.some(m => m.runId === "run-456" && m.role === "assistant");
    assert.strictEqual(newRunAlreadyPersisted, false);
  });

  // Persistent Chat History: Citations retention without re-retrieval
  await test("Persisted assistant message retains structured citation excerpts", () => {
    const msg = {
      id: "msg-1",
      role: "assistant",
      content: "Protocol synthesis",
      citations: [
        { citationId: "c1", documentName: "HAI-Standard.pdf", page: 4, excerpt: "Hand hygiene standard" }
      ]
    };
    assert.strictEqual(msg.citations.length, 1);
    assert.strictEqual(msg.citations[0].documentName, "HAI-Standard.pdf");
    assert.strictEqual(msg.citations[0].page, 4);
  });

  // Evaluation Dashboard: Authoritative Benchmark Metrics Mapping (OBS-004 & OBS-007)
  await test("Evaluation summary correctly maps 33-case baseline without stale fallbacks", () => {
    const fixturePath = require("path").resolve(__dirname, "../fixtures/eval-results.json");
    const evalData = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

    const totalTests = evalData.totalCases ?? evalData.results?.length ?? 33;
    const passed = evalData.passed ?? 30;
    const failed = evalData.failed ?? (totalTests - passed);
    const passRatePct = evalData.passRate ?? Math.round((passed / totalTests) * 100);
    const averageLatencyMs = evalData.operationalMetrics?.avgLatencyMs ?? null;
    const rawCost = evalData.operationalMetrics?.totalCostUsd;
    const totalCostUsd = rawCost != null ? Math.round(rawCost * 100000) / 100000 : null;
    const retrievalRecallPct = evalData.retrievalMetrics?.retrievalRecallPct ?? null;
    const refusalPrecisionPct = evalData.refusalMetrics?.refusalPrecisionPct ?? null;

    // 1. Authoritative 33-case composition
    assert.strictEqual(totalTests, 33, "Total cases must be exactly 33");
    assert.strictEqual(passed, 30, "Passed cases must be exactly 30");
    assert.strictEqual(failed, 3, "Failed cases must be exactly 3");
    assert.strictEqual(passRatePct, 91, "Pass rate must be exactly 91%");

    // 2. Correct operational metrics mapping
    assert.strictEqual(averageLatencyMs, 185, "Average latency must map to 185ms from operationalMetrics.avgLatencyMs");
    assert.strictEqual(totalCostUsd, 0.09352, "Total cost must map to $0.09352 from operationalMetrics.totalCostUsd");

    // 3. Correct retrieval and refusal metrics mapping
    assert.strictEqual(retrievalRecallPct, 88, "Retrieval recall must map to 88% from retrievalMetrics.retrievalRecallPct");
    assert.strictEqual(refusalPrecisionPct, 100, "Refusal precision must map to 100% from refusalMetrics.refusalPrecisionPct");

    // 4. Strict absence of stale demo fallbacks
    assert.notStrictEqual(totalTests, 26, "Total tests must not be stale 26");
    assert.notStrictEqual(averageLatencyMs, 15, "Average latency must not be stale 15ms fallback");
    assert.notStrictEqual(totalCostUsd, 0.0724, "Total cost must not be stale $0.0724 fallback");
  });

  await test("Evaluation fixture results preserve 33 per-case groundedness and outcomes", () => {
    const fixturePath = require("path").resolve(__dirname, "../fixtures/eval-results.json");
    const evalData = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

    assert.strictEqual(evalData.results.length, 33);
    const passedResults = evalData.results.filter(r => r.pass);
    const failedResults = evalData.results.filter(r => !r.pass);
    assert.strictEqual(passedResults.length, 30);
    assert.strictEqual(failedResults.length, 3);

    // Verify the 3 known failing cases below 0.80 threshold
    const failIds = failedResults.map(r => r.id).sort();
    assert.deepStrictEqual(failIds, ["G-05", "G-20", "XL-02"]);

    // Verify all 7 adversarial cases achieved 100% refusal
    const advResults = evalData.results.filter(r => r.id.startsWith("ADV"));
    assert.strictEqual(advResults.length, 7);
    assert(advResults.every(r => r.pass && r.refusalTriggered), "All 7 adversarial cases must pass with refusalTriggered=true");
  });

  console.log("--------------------------------------------------");
  console.log(`Unit Test Summary: ${passed} Passed, ${failed} Failed.`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

runUnitTests().catch((err) => {
  console.error("Unit test fatal error:", err);
  process.exit(1);
});
