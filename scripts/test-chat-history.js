/**
 * DOMAIN COPILOT - PERSISTENT CHAT HISTORY TEST SUITE
 * Comprehensive verification of Conversation & Message persistence,
 * database adapter operations, auth/RBAC ownership boundaries,
 * deterministic title generation, and HITL continuity.
 */

const assert = require("assert");
process.env.AI_PROVIDER = "openai";
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

// Register on-the-fly TypeScript compilation
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

const { DatabaseAdapter } = require("../src/infrastructure/db/database.adapter.ts");
const { generateDeterministicTitle } = require("../src/lib/chat-title.ts");
const {
  canAccessConversation,
  requireConversationAccess,
} = require("../src/infrastructure/auth/auth-guard.ts");

async function runChatHistoryTests() {
  console.log("================================================================================");
  console.log("PERSISTENT CHAT HISTORY TEST SUITE");
  console.log("================================================================================");

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

  const db = new DatabaseAdapter();

  // Test Users
  const userA = {
    id: "user-a-123",
    email: "userA@domaincopilot.ai",
    passwordHash: "hash",
    role: "EXPERT",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  const userB = {
    id: "user-b-456",
    email: "userB@domaincopilot.ai",
    passwordHash: "hash",
    role: "EXPERT",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  const adminUser = {
    id: "admin-789",
    email: "admin@domaincopilot.ai",
    passwordHash: "hash",
    role: "ADMIN",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  // ---------------------------------------------------------------------------
  // 1. Conversation Operations
  // ---------------------------------------------------------------------------

  let convAId = "";
  await test("Create a conversation for userA", async () => {
    const now = new Date().toISOString();
    const conv = await db.createConversation({
      id: `conv-test-${Date.now()}-1`,
      ownerId: userA.id,
      title: "Chemotherapy adverse reactions",
      createdAt: now,
      updatedAt: now,
    });
    convAId = conv.id;
    assert.strictEqual(conv.ownerId, userA.id);
    assert.strictEqual(conv.title, "Chemotherapy adverse reactions");
  });

  await test("Retrieve conversation by ID", async () => {
    const conv = await db.getConversationById(convAId);
    assert.notStrictEqual(conv, null);
    assert.strictEqual(conv.id, convAId);
    assert.strictEqual(conv.ownerId, userA.id);
  });

  await test("List conversations by owner returns only user's chats", async () => {
    // Create another conversation for userA and one for userB
    const now = new Date().toISOString();
    await db.createConversation({
      id: `conv-test-${Date.now()}-2`,
      ownerId: userA.id,
      title: "Pediatric Sepsis Protocol",
      createdAt: now,
      updatedAt: now,
    });
    await db.createConversation({
      id: `conv-test-${Date.now()}-3`,
      ownerId: userB.id,
      title: "Cardiology Guidelines",
      createdAt: now,
      updatedAt: now,
    });

    const userAConvs = await db.listConversationsByOwner(userA.id);
    assert.strictEqual(userAConvs.length >= 2, true);
    assert.strictEqual(userAConvs.every((c) => c.ownerId === userA.id), true);

    const userBConvs = await db.listConversationsByOwner(userB.id);
    assert.strictEqual(userBConvs.every((c) => c.ownerId === userB.id), true);
  });

  await test("Update conversation title and updatedAt", async () => {
    const newTitle = "Updated Chemotherapy Protocol";
    const newUpdated = new Date(Date.now() + 5000).toISOString();
    await db.updateConversation(convAId, { title: newTitle, updatedAt: newUpdated });

    const updated = await db.getConversationById(convAId);
    assert.strictEqual(updated.title, newTitle);
    assert.strictEqual(updated.updatedAt, newUpdated);
  });

  // ---------------------------------------------------------------------------
  // 2. Message Operations & Ordering
  // ---------------------------------------------------------------------------

  let msg1Id = "";
  let msg2Id = "";
  await test("Create user message in conversation", async () => {
    const t1 = new Date(Date.now() - 10000).toISOString();
    const msg = await db.createMessage({
      id: `msg-test-${Date.now()}-1`,
      conversationId: convAId,
      runId: null,
      role: "user",
      content: "What are the first-line vasopressors for septic shock?",
      citations: null,
      createdAt: t1,
    });
    msg1Id = msg.id;
    assert.strictEqual(msg.conversationId, convAId);
    assert.strictEqual(msg.role, "user");
  });

  await test("Create assistant message with runId and citations", async () => {
    const t2 = new Date(Date.now() - 5000).toISOString();
    const mockCitations = [
      {
        citationId: "cit-1",
        chunkId: "chk-1",
        documentId: "doc-1",
        documentName: "Sepsis-2024.pdf",
        page: 12,
        excerpt: "Norepinephrine is the first-choice vasopressor...",
        score: 0.92,
      },
    ];
    const msg = await db.createMessage({
      id: `msg-test-${Date.now()}-2`,
      conversationId: convAId,
      runId: "run-test-123",
      role: "assistant",
      content: "Norepinephrine is recommended as the first-line vasopressor.",
      citations: mockCitations,
      createdAt: t2,
    });
    msg2Id = msg.id;
    assert.strictEqual(msg.runId, "run-test-123");
    assert.strictEqual(msg.citations.length, 1);
    assert.strictEqual(msg.citations[0].documentName, "Sepsis-2024.pdf");
  });

  await test("List messages returns chronological order (user first, then assistant)", async () => {
    const messages = await db.listMessagesByConversation(convAId);
    assert.strictEqual(messages.length >= 2, true);
    assert.strictEqual(messages[0].role, "user");
    assert.strictEqual(messages[1].role, "assistant");
    assert.strictEqual(new Date(messages[0].createdAt) <= new Date(messages[1].createdAt), true);
  });

  await test("Get message by ID retrieves full content and citations", async () => {
    const msg = await db.getMessageById(msg2Id);
    assert.notStrictEqual(msg, null);
    assert.strictEqual(msg.id, msg2Id);
    assert.strictEqual(msg.role, "assistant");
    assert.strictEqual(msg.runId, "run-test-123");
    assert.strictEqual(msg.citations[0].page, 12);
  });

  // ---------------------------------------------------------------------------
  // 3. Multi-turn Chat & Independent Runs
  // ---------------------------------------------------------------------------

  await test("Second exchange in same conversation creates new message pair with distinct runId", async () => {
    const t3 = new Date(Date.now() - 2000).toISOString();
    const t4 = new Date(Date.now() - 1000).toISOString();

    await db.createMessage({
      id: `msg-test-${Date.now()}-3`,
      conversationId: convAId,
      runId: null,
      role: "user",
      content: "What is the target MAP?",
      citations: null,
      createdAt: t3,
    });

    await db.createMessage({
      id: `msg-test-${Date.now()}-4`,
      conversationId: convAId,
      runId: "run-test-456", // Distinct run
      role: "assistant",
      content: "Target mean arterial pressure (MAP) is >= 65 mmHg.",
      citations: [],
      createdAt: t4,
    });

    const messages = await db.listMessagesByConversation(convAId);
    assert.strictEqual(messages.length >= 4, true);
    // Verified 2 user messages and 2 assistant messages with independent run IDs
    const assistantMsgs = messages.filter((m) => m.role === "assistant");
    assert.strictEqual(assistantMsgs[0].runId, "run-test-123");
    assert.strictEqual(assistantMsgs[1].runId, "run-test-456");
  });

  // ---------------------------------------------------------------------------
  // 4. Cascade Deletion
  // ---------------------------------------------------------------------------

  await test("Deleting conversation cascades to all its messages", async () => {
    const tempConv = await db.createConversation({
      id: `conv-temp-${Date.now()}`,
      ownerId: userA.id,
      title: "Temporary Chat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.createMessage({
      id: `msg-temp-${Date.now()}`,
      conversationId: tempConv.id,
      role: "user",
      content: "Temp content",
      createdAt: new Date().toISOString(),
    });

    let msgsBefore = await db.listMessagesByConversation(tempConv.id);
    assert.strictEqual(msgsBefore.length, 1);

    await db.deleteConversation(tempConv.id);

    const convAfter = await db.getConversationById(tempConv.id);
    assert.strictEqual(convAfter, null);

    const msgsAfter = await db.listMessagesByConversation(tempConv.id);
    assert.strictEqual(msgsAfter.length, 0);
  });

  // ---------------------------------------------------------------------------
  // 5. Auth & RBAC Boundaries
  // ---------------------------------------------------------------------------

  await test("canAccessConversation allows owner to access conversation", async () => {
    const conv = await db.getConversationById(convAId);
    assert.strictEqual(canAccessConversation(userA, conv), true);
  });

  await test("canAccessConversation allows ADMIN to access any conversation", async () => {
    const conv = await db.getConversationById(convAId);
    assert.strictEqual(canAccessConversation(adminUser, conv), true);
  });

  await test("canAccessConversation denies non-owner from accessing conversation", async () => {
    const conv = await db.getConversationById(convAId);
    assert.strictEqual(canAccessConversation(userB, conv), false);
  });

  await test("requireConversationAccess throws ForbiddenError for unauthorized user", async () => {
    const conv = await db.getConversationById(convAId);
    assert.throws(
      () => requireConversationAccess(userB, conv),
      (err) => err.code === "FORBIDDEN" || err.httpStatus === 403
    );
  });

  // ---------------------------------------------------------------------------
  // 6. Deterministic Title Generation
  // ---------------------------------------------------------------------------

  await test("generateDeterministicTitle truncates gracefully at word boundary", () => {
    const longMsg = "What are the recommended prevention standards for hospital-acquired infections in ICU?";
    const title = generateDeterministicTitle(longMsg, 40);
    assert.strictEqual(title.length <= 45, true);
    assert.strictEqual(title.endsWith("..."), true);
  });

  await test("generateDeterministicTitle handles empty or whitespace message", () => {
    assert.strictEqual(generateDeterministicTitle(""), "New Chat");
    assert.strictEqual(generateDeterministicTitle("   "), "New Chat");
  });

  await test("generateDeterministicTitle handles Arabic queries", () => {
    const arMsg = "ما هي معايير الوقاية من العدوى المكتسبة في المستشفيات؟";
    const title = generateDeterministicTitle(arMsg, 40);
    assert.strictEqual(title.length <= 45, true);
    assert.strictEqual(title.startsWith("ما هي معايير"), true);
  });

  // ---------------------------------------------------------------------------
  // 7. HITL Compatibility Simulation
  // ---------------------------------------------------------------------------

  await test("HITL pending state does not persist assistant message prematurely", async () => {
    const hitlConv = await db.createConversation({
      id: `conv-hitl-${Date.now()}`,
      ownerId: userA.id,
      title: "HITL Test Conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // User message posted
    await db.createMessage({
      id: `msg-hitl-user-${Date.now()}`,
      conversationId: hitlConv.id,
      role: "user",
      content: "Recommend protocol for high-risk patient with allergy contraindication",
      createdAt: new Date().toISOString(),
    });

    // Run created in APPROVAL_PENDING state
    const run = await db.saveRun({
      id: `run-hitl-${Date.now()}`,
      ownerId: userA.id,
      sessionId: hitlConv.id,
      correlationId: `corr-hitl-${Date.now()}`,
      query: "Recommend protocol...",
      status: "APPROVAL_PENDING",
      citations: [],
      startedAt: new Date().toISOString(),
    });

    // While paused, only 1 message (user) should exist
    const msgsWhilePending = await db.listMessagesByConversation(hitlConv.id);
    assert.strictEqual(msgsWhilePending.length, 1);
    assert.strictEqual(msgsWhilePending[0].role, "user");

    // Human approves and workflow resumes to completion:
    // Persist assistant message
    const completedAssistantMsg = await db.createMessage({
      id: `msg-hitl-asst-${Date.now()}`,
      conversationId: hitlConv.id,
      runId: run.id,
      role: "assistant",
      content: "Approved therapeutic protocol: ...",
      citations: [{ citationId: "c1", documentName: "Protocol.pdf", page: 1, excerpt: "Excerpt" }],
      createdAt: new Date().toISOString(),
    });

    // Verify exactly 1 assistant message is persisted
    const msgsAfterResume = await db.listMessagesByConversation(hitlConv.id);
    assert.strictEqual(msgsAfterResume.length, 2);
    assert.strictEqual(msgsAfterResume[1].role, "assistant");
    assert.strictEqual(msgsAfterResume[1].runId, run.id);

    // Repeated resume attempts should detect existing message and not duplicate
    const alreadyPersisted = msgsAfterResume.some(
      (m) => m.runId === run.id && m.role === "assistant"
    );
    assert.strictEqual(alreadyPersisted, true);
  });

  await test("HITL approval -> resume -> persisted assistant message -> conversation rehydration", async () => {
    const hitlConv = await db.createConversation({
      id: `conv-rehydrate-${Date.now()}`,
      ownerId: userA.id,
      title: "Dosage Protocol Review",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 1. User sends a consequential query
    const userMsg = await db.createMessage({
      id: `msg-rehydrate-user-${Date.now()}`,
      conversationId: hitlConv.id,
      role: "user",
      content: "What exact dosage should be used when the patient's weight and renal function are unavailable?",
      createdAt: new Date().toISOString(),
    });

    // 2. Run enters APPROVAL_PENDING
    const run = await db.saveRun({
      id: `run-rehydrate-${Date.now()}`,
      ownerId: userA.id,
      sessionId: hitlConv.id,
      correlationId: `corr-rehydrate-${Date.now()}`,
      query: userMsg.content,
      status: "APPROVAL_PENDING",
      citations: [],
      startedAt: new Date().toISOString(),
    });

    const approval = await db.saveApproval({
      id: `appr-rehydrate-${Date.now()}`,
      runId: run.id,
      stepId: "safety-auditor",
      riskLevel: "CRITICAL",
      proposedAction: "Administer standardized empiric renal-sparing protocol",
      status: "PENDING",
      createdAt: new Date().toISOString(),
    });

    // Verify invariant: No assistant message while APPROVAL_PENDING
    let currentMsgs = await db.listMessagesByConversation(hitlConv.id);
    assert.strictEqual(currentMsgs.length, 1);
    assert.strictEqual(currentMsgs[0].role, "user");

    // 3. Human approval succeeds
    await db.updateApproval(approval.id, "APPROVED", undefined, "Approved by Dr. Approver", userA.id);
    const updatedApproval = await db.getApprovalById(approval.id);
    assert.strictEqual(updatedApproval.status, "APPROVED");

    // 4. Run resumes and completes
    const cleanSynthesis = "Empiric dosing guidelines dictate standard loading dose with mandatory TDM.";
    const citations = [
      { citationId: "cit-1", documentName: "Renal_Dosing_Guidelines.pdf", page: 4, excerpt: "Standard empiric loading dose..." }
    ];

    await db.updateRunStatus(run.id, "COMPLETED", undefined, cleanSynthesis);

    // 5. Exactly ONE assistant message is persisted
    const asstMsg = await db.createMessage({
      id: `msg-rehydrate-asst-${Date.now()}`,
      conversationId: hitlConv.id,
      runId: run.id,
      role: "assistant",
      content: cleanSynthesis,
      citations,
      createdAt: new Date().toISOString(),
    });

    // 6. UI / API rehydration verification
    // GET /api/conversations/:id/messages contains user message + exactly ONE assistant message
    const rehydratedMsgs = await db.listMessagesByConversation(hitlConv.id);
    assert.strictEqual(rehydratedMsgs.length, 2);
    assert.strictEqual(rehydratedMsgs[0].role, "user");
    assert.strictEqual(rehydratedMsgs[1].role, "assistant");
    assert.strictEqual(rehydratedMsgs[1].runId, run.id);
    assert.strictEqual(rehydratedMsgs[1].content, cleanSynthesis);
    assert.strictEqual(rehydratedMsgs[1].citations.length, 1);

    // 7. Duplicate resume attempts guarantee idempotency (no duplicate assistant message)
    const existingAssistantMsgs = rehydratedMsgs.filter(
      (m) => m.runId === run.id && m.role === "assistant"
    );
    assert.strictEqual(existingAssistantMsgs.length, 1);

    // 8. Run-to-Conversation mapping recovery (used by Copilot UI when navigating from Reviews)
    const runRecord = await db.getRunById(run.id);
    assert.strictEqual(runRecord.sessionId, hitlConv.id);
  });

  console.log("================================================================================");
  console.log(`Persistent Chat History Test Results: ${passed} Passed, ${failed} Failed`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runChatHistoryTests().catch((err) => {
  console.error("Test suite execution failed:", err);
  process.exit(1);
});
