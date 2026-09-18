/**
 * DOMAIN COPILOT - REAL LOCAL OLLAMA E2E SMOKE TEST
 * Tests full end-to-end multi-agent execution on real local Ollama (qwen3:8b):
 * 1. Normal grounded clinical query (no timeout, clean synthesis, citations intact)
 * 2. High-risk clinical query triggering HITL approval gate
 * 3. Human decision approval
 * 4. Resuming the paused workflow
 * 5. Clean final synthesis rendering without raw JSON container
 * 6. Low-evidence safe refusal gate
 */

const assert = require("assert");

const BASE_URL = "http://localhost:3000";

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function runE2EValidation() {
  console.log("================================================================================");
  console.log("REAL LOCAL OLLAMA E2E VALIDATION SUITE");
  console.log("Testing full workflow, HITL pause/approval/resume, clean synthesis, and refusal");
  console.log("================================================================================");

  const expertToken = await login("expert@domaincopilot.ai", "expert123");
  const approverToken = await login("approver@domaincopilot.ai", "approver123");
  console.log("✓ Authenticated expert and approver test users.");

  // --------------------------------------------------------------------------
  // Scenario 1: Grounded Clinical Query with Full Lifecycle (Extract -> Audit -> HITL -> Resume -> Clean Synthesis)
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 1: Grounded Clinical Query (Full Lifecycle) ---");
  const query1 = "What are the recommended first-line antibiotics and dosage adjustments for acute uncomplicated cystitis?";
  console.log(`Submitting: "${query1}"`);

  const t0 = Date.now();
  const initRes1 = await fetch(`${BASE_URL}/api/queries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${expertToken}`,
    },
    body: JSON.stringify({ query: query1 }),
  });

  assert.strictEqual(initRes1.status, 200, "Query submission should succeed with 200");
  const initData1 = await initRes1.json();
  const runId1 = initData1.runId;
  console.log(`Run started: ${runId1}`);

  // Consume SSE stream until approval_required or done
  const streamRes1 = await fetch(`${BASE_URL}/api/runs/${runId1}/stream`, {
    headers: { Authorization: `Bearer ${expertToken}` },
  });

  const reader1 = streamRes1.body.getReader();
  const decoder1 = new TextDecoder();
  let finalAnswer1 = "";
  let doneData1 = null;
  let citations1 = [];
  let stepsCompleted1 = [];
  let approvalId1 = null;

  while (true) {
    const { done, value } = await reader1.read();
    if (done) break;
    const chunk = decoder1.decode(value);
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "step_complete" && evt.agent) {
            stepsCompleted1.push(evt.agent);
            console.log(`  [Step Complete] ${evt.agent} (took ${evt.data?.durationMs || "?"} ms)`);
          }
          if (evt.type === "citation") {
            citations1.push(evt.data);
          }
          if (evt.type === "approval_required") {
            approvalId1 = evt.data?.approvalId;
            console.log(`  [HITL Paused] Approval ID: ${approvalId1}`);
          }
          if (evt.type === "done") {
            doneData1 = evt;
            finalAnswer1 = evt.finalAnswer || evt.data?.finalAnswer || "";
          }
        } catch {}
      }
    }
  }

  const initialDuration = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`Initial phase completed in ${initialDuration}s`);
  assert.ok(citations1.length > 0, `Must receive citations (got ${citations1.length})`);
  assert.ok(stepsCompleted1.includes("Clinical Evidence Extractor"), "Extractor must complete");
  assert.ok(stepsCompleted1.includes("Contraindication & Safety Auditor"), "Auditor must complete");

  // If paused on HITL, approve and resume to verify clean synthesis
  if (approvalId1) {
    console.log(`Approving request ${approvalId1} as Approver...`);
    const appRes = await fetch(`${BASE_URL}/api/approvals/${approvalId1}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${approverToken}`,
      },
      body: JSON.stringify({ reason: "Clinical parameters verified against institutional protocol." }),
    });
    assert.strictEqual(appRes.status, 200, "Approval should succeed with 200");

    console.log(`Resuming run ${runId1}...`);
    const tResume = Date.now();
    const resumeRes = await fetch(`${BASE_URL}/api/runs/${runId1}/resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${approverToken}`,
      },
      body: JSON.stringify({ approvalId: approvalId1 }),
    });
    assert.strictEqual(resumeRes.status, 200, "Resume must return 200");

    const readerResume = resumeRes.body.getReader();
    while (true) {
      const { done, value } = await readerResume.read();
      if (done) break;
      const chunk = decoder1.decode(value);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "done") {
              doneData1 = evt;
              finalAnswer1 = evt.finalAnswer || evt.data?.finalAnswer || "";
            }
          } catch {}
        }
      }
    }
    console.log(`Resume completed in ${((Date.now() - tResume) / 1000).toFixed(2)}s`);
  }

  assert.ok(doneData1 !== null, "Stream must emit done event");
  assert.ok(finalAnswer1.length > 30, "Must return substantial clean final answer");
  assert.strictEqual(
    finalAnswer1.trim().startsWith("{") && finalAnswer1.includes('"synthesis"'),
    false,
    "Final answer must be clean synthesis text and NOT a raw JSON container"
  );
  console.log(`✓ Scenario 1 PASSED: Completed successfully.`);
  console.log(`  Preview: "${finalAnswer1.slice(0, 140)}..."`);

  // --------------------------------------------------------------------------
  // Scenario 2: High-Risk Query -> HITL Pause -> Approval -> Resume -> Done
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 2: High-Risk HITL Query & Resume Continuity ---");
  const query2 = "What are the dosage titration boundaries and contraindications for oncology chemotherapy?";
  console.log(`Submitting: "${query2}"`);

  const initRes2 = await fetch(`${BASE_URL}/api/queries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${expertToken}`,
    },
    body: JSON.stringify({ query: query2 }),
  });

  const initData2 = await initRes2.json();
  const runId2 = initData2.runId;
  console.log(`Run started: ${runId2}`);

  // Stream until pause
  const streamRes2 = await fetch(`${BASE_URL}/api/runs/${runId2}/stream`, {
    headers: { Authorization: `Bearer ${expertToken}` },
  });

  const reader2 = streamRes2.body.getReader();
  const decoder2 = new TextDecoder();
  let approvalId2 = null;
  let isPaused2 = false;

  while (true) {
    const { done, value } = await reader2.read();
    if (done) break;
    const chunk = decoder2.decode(value);
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "approval_required") {
            isPaused2 = true;
            approvalId2 = evt.data?.approvalId;
            console.log(`  [HITL Paused] Approval ID: ${approvalId2}`);
          }
        } catch {}
      }
    }
  }

  assert.ok(isPaused2, "Workflow must pause on HITL gate for chemotherapy query");
  assert.ok(approvalId2, "Must return valid approvalId");
  console.log("✓ Workflow correctly paused at HITL Approval Gate.");

  // Approve via Approver
  console.log(`Approving request ${approvalId2} as Approver...`);
  const approveRes = await fetch(`${BASE_URL}/api/approvals/${approvalId2}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${approverToken}`,
    },
    body: JSON.stringify({ reason: "Dose titration boundaries verified against institutional guidelines." }),
  });
  assert.strictEqual(approveRes.status, 200, "Approval should succeed with 200");
  console.log("✓ Approval granted.");

  // Resume workflow
  console.log(`Resuming run ${runId2}...`);
  const tResume = Date.now();
  const resumeRes = await fetch(`${BASE_URL}/api/runs/${runId2}/resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${approverToken}`,
    },
    body: JSON.stringify({ approvalId: approvalId2 }),
  });

  assert.strictEqual(resumeRes.status, 200, "Resume endpoint should return 200");
  const readerResume = resumeRes.body.getReader();
  let finalAnswer2 = "";
  let doneResume = false;

  while (true) {
    const { done, value } = await readerResume.read();
    if (done) break;
    const chunk = decoder2.decode(value);
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "done") {
            doneResume = true;
            finalAnswer2 = evt.finalAnswer || evt.data?.finalAnswer || "";
          }
        } catch {}
      }
    }
  }

  const resumeDuration = ((Date.now() - tResume) / 1000).toFixed(2);
  assert.ok(doneResume, "Resume stream must emit done event");
  assert.ok(finalAnswer2.length > 50, "Resume final answer must not be empty");
  assert.strictEqual(
    finalAnswer2.trim().startsWith("{") && finalAnswer2.includes('"synthesis"'),
    false,
    "Resume final answer must be clean synthesis text and NOT raw JSON"
  );
  console.log(`✓ Scenario 2 PASSED: Resume completed in ${resumeDuration}s.`);
  console.log(`  Preview: "${finalAnswer2.slice(0, 140)}..."`);

  // --------------------------------------------------------------------------
  // Scenario 3: Low-Evidence Safe Refusal Gate
  // --------------------------------------------------------------------------
  console.log("\n--- Scenario 3: Low-Evidence Safe Refusal Gate ---");
  const query3 = "quantum electrodynamics entanglement";
  console.log(`Submitting: "${query3}"`);

  const initRes3 = await fetch(`${BASE_URL}/api/queries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${expertToken}`,
    },
    body: JSON.stringify({ query: query3 }),
  });

  const initData3 = await initRes3.json();
  const runId3 = initData3.runId;

  const streamRes3 = await fetch(`${BASE_URL}/api/runs/${runId3}/stream`, {
    headers: { Authorization: `Bearer ${expertToken}` },
  });

  const reader3 = streamRes3.body.getReader();
  let isRefusal3 = false;
  let refusalMessage3 = "";

  while (true) {
    const { done, value } = await reader3.read();
    if (done) break;
    const chunk = decoder2.decode(value);
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "refusal") {
            isRefusal3 = true;
            refusalMessage3 = evt.message;
          }
        } catch {}
      }
    }
  }

  assert.ok(isRefusal3, "Low-evidence query must trigger refusal");
  console.log(`✓ Scenario 3 PASSED: Refused as expected: "${refusalMessage3}"`);

  console.log("\n================================================================================");
  console.log("ALL REAL LOCAL OLLAMA E2E SCENARIOS PASSED!");
  console.log("================================================================================");
}

runE2EValidation().catch(err => {
  console.error("E2E validation failed:", err);
  process.exit(1);
});
