/**
 * REFUSAL WORKFLOW REGRESSION TEST SUITE (PART 11)
 * 
 * Verifies end-to-end against the running server:
 * 1. REFUSAL-EN: "Who won the FIFA World Cup in 2022?" -> REFUSED, citations = []
 * 2. REFUSAL-AR: "من فاز بكأس العالم لكرة القدم عام 2022؟" -> REFUSED, citations = []
 * 3. GROUNDED-EN: "What safety checks are required before a protocol update?" -> COMPLETED, citations > 0
 * 4. GROUNDED-AR: "ما هي معايير الاستقرار السريري للضغط الشرياني ومعدل إخراج البول؟" -> COMPLETED, citations > 0
 * 5. HITL: "Execute protocol update: set heparin dosage to 50,000 units IV bolus immediately" -> APPROVAL_PENDING
 * 6. Persistence: Refusal message persists in conversation history with status=REFUSED, code=LOW_EVIDENCE_REFUSAL, and citations=[]
 */

const assert = require("assert");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function loginAsAdmin() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@domaincopilot.ai", password: "admin123" }),
  });
  assert.strictEqual(res.status, 200, "Admin login must succeed");
  const data = await res.json();
  return data.token;
}

async function captureStream(runId, token) {
  const url = `${BASE_URL}/api/runs/${encodeURIComponent(runId)}/stream`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Stream request failed: HTTP ${res.status}`);
  }

  const events = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      if (!part.trim()) continue;
      let eventType = "message";
      let dataStr = "";
      const lines = part.split("\n");
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.replace(/^event:\s*/, "").trim();
        } else if (line.startsWith("data:")) {
          dataStr += line.replace(/^data:\s*/, "");
        }
      }

      let parsedData = null;
      try {
        parsedData = JSON.parse(dataStr);
      } catch {
        parsedData = dataStr;
      }

      events.push({ event: eventType, data: parsedData });
    }
  }

  return events;
}

async function runQuery(token, queryText) {
  // 1. Create conversation
  const convRes = await fetch(`${BASE_URL}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: "Test Query" }),
  });
  assert.strictEqual(convRes.status, 201);
  const { conversation } = await convRes.json();

  // 2. Submit query via message endpoint
  const queryRes = await fetch(`${BASE_URL}/api/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: queryText }),
  });
  assert.strictEqual(queryRes.status, 201);
  const queryBody = await queryRes.json();
  const runId = queryBody.run?.id || queryBody.runId;

  // 3. Connect to SSE stream to trigger and complete execution
  const streamEvents = await captureStream(runId, token);

  // 4. Fetch finalized run record
  const runRes = await fetch(`${BASE_URL}/api/runs/${runId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(runRes.status, 200);
  const data = await runRes.json();
  const run = data.run;

  // 5. Load persisted messages
  const msgRes = await fetch(`${BASE_URL}/api/conversations/${conversation.id}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(msgRes.status, 200);
  const { messages } = await msgRes.json();

  return { conversation, run, messages, streamEvents };
}

async function runSuite() {
  console.log("================================================================================");
  console.log("REFUSAL WORKFLOW & RETRIEVAL REGRESSION TEST SUITE (PART 11)");
  console.log(`Target: ${BASE_URL}`);
  console.log("================================================================================");

  const token = await loginAsAdmin();
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ FAIL: ${name}`);
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

function getSafeStreamDisplayText(raw) {
  if (!raw) return "";
  let trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("```json")) {
    trimmed = trimmed.replace(/^```json\s*/i, "").trim();
  }
  if (trimmed.startsWith("{") || trimmed.includes('"synthesis"') || trimmed.includes('"refusalNotice"')) {
    if (
      trimmed.includes('"refusalNotice"') ||
      /unrelated|cannot be provided|no synthesis|out of scope|insufficient evidence/i.test(trimmed)
    ) {
      return "";
    }
    const synthesisKeyIdx = trimmed.indexOf('"synthesis"');
    if (synthesisKeyIdx === -1) return "";
    const colonIdx = trimmed.indexOf(":", synthesisKeyIdx);
    if (colonIdx === -1) return "";
    const quoteIdx = trimmed.indexOf('"', colonIdx);
    if (quoteIdx === -1) return "";
    const afterQuote = trimmed.slice(quoteIdx + 1);
    let endIdx = -1;
    for (let i = 0; i < afterQuote.length; i++) {
      if (afterQuote[i] === '"' && (i === 0 || afterQuote[i - 1] !== "\\")) {
        endIdx = i;
        break;
      }
    }
    let extracted = endIdx === -1 ? afterQuote : afterQuote.slice(0, endIdx);
    try {
      extracted = JSON.parse(`"${extracted.replace(/\\"/g, '"').replace(/"/g, '\\"')}"`);
    } catch {
      extracted = extracted.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
    if (endIdx === -1 && extracted.length < 80) {
      return "";
    }
    if (/unrelated|cannot be provided|no synthesis|out of scope|insufficient evidence|not contain|not mentioned/i.test(extracted)) {
      return "";
    }
    return extracted;
  }
  return raw;
}

  // 1. REFUSAL-EN
  await test("REFUSAL-EN: 'Who won the FIFA World Cup in 2022?' -> REFUSED, citations = 0", async () => {
    const { run, messages, streamEvents } = await runQuery(token, "Who won the FIFA World Cup in 2022?");
    assert.strictEqual(run.status, "REFUSED", `Expected REFUSED, got ${run.status}`);
    assert.strictEqual(run.citations?.length || 0, 0, "Citations on run must be strictly empty");

    // Verify SSE emitted refusal event
    const refusalEvent = streamEvents.find((e) => e.event === "refusal");
    assert.ok(refusalEvent, "SSE stream must include a refusal event");

    // Verify that during streaming, getSafeStreamDisplayText NEVER exposed raw JSON or refusal keys
    const tokenEvents = streamEvents.filter((e) => e.event === "token");
    let accumulated = "";
    for (const te of tokenEvents) {
      accumulated += te.data?.token || "";
      const display = getSafeStreamDisplayText(accumulated);
      assert.strictEqual(display, "", "Active stream display must be suppressed for refusal run (no raw JSON leaked)");
    }

    // Check persisted assistant message
    const assistantMsg = messages.find((m) => m.role === "assistant");
    assert.ok(assistantMsg, "Assistant refusal message must be persisted");
    assert.strictEqual(assistantMsg.citations?.length || 0, 0, "Persisted message citations must be strictly empty");
    assert.strictEqual(assistantMsg.metadata?.status, "REFUSED", "Message metadata.status must be REFUSED");
    assert.strictEqual(assistantMsg.metadata?.code, "LOW_EVIDENCE_REFUSAL", "Message metadata.code must be LOW_EVIDENCE_REFUSAL");
  });

  // 2. REFUSAL-AR
  await test("REFUSAL-AR: 'من فاز بكأس العالم لكرة القدم عام 2022؟' -> REFUSED, citations = 0", async () => {
    const { run, messages, streamEvents } = await runQuery(token, "من فاز بكأس العالم لكرة القدم عام 2022؟");
    assert.strictEqual(run.status, "REFUSED", `Expected REFUSED, got ${run.status}`);
    assert.strictEqual(run.citations?.length || 0, 0, "Citations on run must be strictly empty");

    // Verify SSE emitted refusal event
    const refusalEvent = streamEvents.find((e) => e.event === "refusal");
    assert.ok(refusalEvent, "SSE stream must include a refusal event");

    // Check persisted assistant message
    const assistantMsg = messages.find((m) => m.role === "assistant");
    assert.ok(assistantMsg, "Assistant refusal message must be persisted");
    assert.strictEqual(assistantMsg.citations?.length || 0, 0, "Persisted message citations must be strictly empty");
    assert.strictEqual(assistantMsg.metadata?.status, "REFUSED", "Message metadata.status must be REFUSED");
    assert.strictEqual(assistantMsg.metadata?.code, "LOW_EVIDENCE_REFUSAL", "Message metadata.code must be LOW_EVIDENCE_REFUSAL");
  });

  // 3. GROUNDED-EN
  await test("GROUNDED-EN: 'What safety checks are required before a protocol update?' -> COMPLETED, citations > 0", async () => {
    const { run, messages, streamEvents } = await runQuery(token, "What safety checks are required before a protocol update?");
    assert.strictEqual(run.status, "COMPLETED", `Expected COMPLETED, got ${run.status}`);
    assert.ok(run.citations && run.citations.length > 0, "Citations on run must be present");

    // Verify that during streaming, getSafeStreamDisplayText extracted clean synthesis without JSON syntax
    const tokenEvents = streamEvents.filter((e) => e.event === "token");
    let accumulated = "";
    let extractedClean = false;
    for (const te of tokenEvents) {
      accumulated += te.data?.token || "";
      const display = getSafeStreamDisplayText(accumulated);
      if (display.length > 10) {
        extractedClean = true;
        assert.ok(!display.startsWith("{"), "Streamed display must not start with raw JSON brace");
        assert.ok(!display.includes('"synthesis"'), "Streamed display must not leak synthesis JSON key");
      }
    }
    assert.ok(extractedClean, "Grounded query must stream human-readable synthesis text");

    const assistantMsg = messages.find((m) => m.role === "assistant");
    assert.ok(assistantMsg, "Assistant message must be persisted");
    assert.ok(assistantMsg.citations && assistantMsg.citations.length > 0, "Persisted message must retain citations");
  });

  // 4. GROUNDED-AR
  await test("GROUNDED-AR: 'ما هي معايير الاستقرار السريري للضغط الشرياني ومعدل إخراج البول؟' -> COMPLETED, citations > 0", async () => {
    const { run, messages } = await runQuery(token, "ما هي معايير الاستقرار السريري للضغط الشرياني ومعدل إخراج البول؟");
    assert.strictEqual(run.status, "COMPLETED", `Expected COMPLETED, got ${run.status}`);
    assert.ok(run.citations && run.citations.length > 0, "Citations on run must be present");

    const assistantMsg = messages.find((m) => m.role === "assistant");
    assert.ok(assistantMsg, "Assistant message must be persisted");
    assert.ok(assistantMsg.citations && assistantMsg.citations.length > 0, "Persisted message must retain citations");
  });

  // 5. HITL
  await test("HITL: 'Execute protocol update: set heparin dosage to 50,000 units IV bolus immediately' -> APPROVAL_PENDING", async () => {
    const { run, messages, streamEvents } = await runQuery(token, "Execute protocol update: set heparin dosage to 50,000 units IV bolus immediately");
    assert.strictEqual(run.status, "APPROVAL_PENDING", `Expected APPROVAL_PENDING, got ${run.status}`);
    assert.strictEqual(messages.filter((m) => m.role === "assistant").length, 0, "Assistant message must not be persisted prematurely during HITL");

    const approvalEvent = streamEvents.find((e) => e.event === "approval_required");
    assert.ok(approvalEvent, "SSE stream must include an approval_required event");
  });

  console.log("================================================================================");
  console.log(`REFUSAL WORKFLOW TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runSuite().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
