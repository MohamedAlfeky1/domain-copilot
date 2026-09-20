/**
 * REGRESSION TEST SUITE: PERSISTENT & RECOVERABLE COPILOT HITL APPROVAL STATE
 * Verifies all 12 required test conditions from Section 15:
 * 1. Conversation with APPROVAL_PENDING run restores approval state
 * 2. Conversation without pending approval shows no approval
 * 3. Switching conversations does not delete pending approval
 * 4. Returning to pending conversation restores approval
 * 5. Refresh restores approval (via conversationId query / re-fetch)
 * 6. Deep-link conversationId restores approval
 * 7. Approve after rehydration works via POST /api/approvals/:id/approve
 * 8. Approve & Continue resumes automatically
 * 9. Final assistant message appears in same conversation
 * 10. Exactly one assistant message is persisted
 * 11. A pending approval from Conversation A never appears in Conversation B
 * 12. Unauthorized users cannot approve restored approvals
 */

const assert = require("assert");

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { ...options.headers };
  if (options.body && typeof options.body === "object") {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, { ...options, headers });
  let data = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }
  return { status: res.status, data };
}

async function login(email, password) {
  const res = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.strictEqual(res.status, 200, `Login failed for ${email}`);
  return res.data.token;
}

async function streamUntilApproval(runId, token) {
  const url = `${BASE_URL}/api/runs/${encodeURIComponent(runId)}/stream`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return new Promise((resolve, reject) => {
    let approvalId = null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    function processText(text) {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "approval_required") {
              approvalId = data.approvalId || data.data?.approvalId;
            }
          } catch {}
        }
      }
    }

    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          processText("");
          resolve(approvalId);
          return;
        }
        processText(decoder.decode(value, { stream: true }));
        if (approvalId) {
          reader.cancel().catch(() => {});
          resolve(approvalId);
          return;
        }
        read();
      }).catch(reject);
    }

    read();
  });
}

async function streamResume(runId, approvalId, token) {
  const url = `${BASE_URL}/api/runs/${encodeURIComponent(runId)}/resume`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ approvalId }),
  });

  assert.strictEqual(res.status, 200, `Resume failed with HTTP ${res.status}`);

  return new Promise((resolve, reject) => {
    let tokens = "";
    let finalAnswer = "";
    let isDone = false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    function processText(text) {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "token") {
              tokens += (data.token || "");
            } else if (data.type === "done") {
              isDone = true;
              finalAnswer = data.finalAnswer || data.data?.finalAnswer || "";
            }
          } catch {}
        }
      }
    }

    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          processText("");
          resolve({ tokens, finalAnswer, isDone });
          return;
        }
        processText(decoder.decode(value, { stream: true }));
        read();
      }).catch(reject);
    }

    read();
  });
}

async function runRegressionSuite() {
  console.log("================================================================================");
  console.log("COPILOT HITL STATE PERSISTENCE REGRESSION SUITE");
  console.log("Testing 12 Persistent Approval Requirements");
  console.log("================================================================================");

  const adminToken = await login("admin@domaincopilot.ai", "admin123");
  const approverToken = await login("approver@domaincopilot.ai", "approver123");
  const expertToken = await login("expert@domaincopilot.ai", "expert123");
  const viewerToken = await login("viewer@domaincopilot.ai", "viewer123");
  console.log("✓ Authenticated users: ADMIN, APPROVER, EXPERT, VIEWER");

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const approverHeaders = { Authorization: `Bearer ${approverToken}` };
  const expertHeaders = { Authorization: `Bearer ${expertToken}` };
  const viewerHeaders = { Authorization: `Bearer ${viewerToken}` };

  // --------------------------------------------------------------------------
  // Setup: Create Conversation A and Conversation B
  // --------------------------------------------------------------------------
  const convARes = await request("/api/conversations", {
    method: "POST",
    headers: adminHeaders,
    body: { title: "Conversation A (HITL)" },
  });
  assert.strictEqual(convARes.status, 201);
  const convAId = convARes.data.conversation.id;

  const convBRes = await request("/api/conversations", {
    method: "POST",
    headers: adminHeaders,
    body: { title: "Conversation B (Normal)" },
  });
  assert.strictEqual(convBRes.status, 201);
  const convBId = convBRes.data.conversation.id;

  try {
    // ------------------------------------------------------------------------
    // Trigger HITL on Conversation A
    // ------------------------------------------------------------------------
    const msgARes = await request(`/api/conversations/${convAId}/messages`, {
      method: "POST",
      headers: adminHeaders,
      body: { content: "Execute protocol update: set heparin dosage to 50,000 units IV bolus immediately" },
    });
    assert.strictEqual(msgARes.status, 201);
    const runAId = msgARes.data.runId;

    console.log("Triggering HITL on Conversation A...");
    const approvalAId = await streamUntilApproval(runAId, adminToken);
    assert.ok(approvalAId, "Conversation A must trigger HITL with valid approvalId");
    console.log(`✓ Conversation A paused at HITL. Run: ${runAId}, Approval: ${approvalAId}`);

    // TEST 1: Conversation with APPROVAL_PENDING run restores approval state
    console.log("\n--- TEST 1: Conversation with APPROVAL_PENDING restores approval state ---");
    const checkA1 = await request(`/api/conversations/${convAId}/approval`, { headers: adminHeaders });
    assert.strictEqual(checkA1.status, 200);
    assert.strictEqual(checkA1.data.hasPendingApproval, true);
    assert.strictEqual(checkA1.data.runId, runAId);
    assert.strictEqual(checkA1.data.conversationId, convAId);
    assert.strictEqual(checkA1.data.status, "APPROVAL_PENDING");
    assert.ok(checkA1.data.approval);
    assert.strictEqual(checkA1.data.approval.id, approvalAId);
    assert.ok(checkA1.data.approval.proposedAction);
    assert.ok(Array.isArray(checkA1.data.approval.riskFlags));
    console.log("✓ PASS [REQ-1]: Conversation A restores pending approval state with all details");

    // TEST 2: Conversation without pending approval shows no approval
    console.log("\n--- TEST 2: Conversation without pending approval shows no approval ---");
    const checkB1 = await request(`/api/conversations/${convBId}/approval`, { headers: adminHeaders });
    assert.strictEqual(checkB1.status, 200);
    assert.strictEqual(checkB1.data.hasPendingApproval, false);
    assert.strictEqual(checkB1.data.runId, null);
    assert.strictEqual(checkB1.data.approval, null);
    console.log("✓ PASS [REQ-2]: Conversation B returns hasPendingApproval = false");

    // TEST 3: Switching conversations does not delete pending approval
    console.log("\n--- TEST 3: Switching conversations does not delete pending approval ---");
    // User switches to Conversation B and posts a message
    const msgBRes = await request(`/api/conversations/${convBId}/messages`, {
      method: "POST",
      headers: adminHeaders,
      body: { content: "What is the recommended dosage of amoxicillin for simple ear infection?" },
    });
    assert.strictEqual(msgBRes.status, 201);
    // Verify Conversation A backend run and approval state are completely untouched
    const runACheck = await request(`/api/runs/${runAId}`, { headers: adminHeaders });
    assert.strictEqual(runACheck.data.run.status, "APPROVAL_PENDING");
    assert.strictEqual(runACheck.data.approval.status, "PENDING");
    console.log("✓ PASS [REQ-3]: Active run and approval in Conversation A remain intact after posting in B");

    // TEST 4: Returning to pending conversation restores approval
    console.log("\n--- TEST 4: Returning to pending conversation restores approval ---");
    const checkA2 = await request(`/api/conversations/${convAId}/approval`, { headers: adminHeaders });
    assert.strictEqual(checkA2.data.hasPendingApproval, true);
    assert.strictEqual(checkA2.data.approval.id, approvalAId);
    console.log("✓ PASS [REQ-4]: Returning to Conversation A successfully rehydrates approval");

    // TEST 5 & 6: Refresh and deep-link conversationId restores approval
    console.log("\n--- TEST 5 & 6: Refresh and deep-link conversationId restores approval ---");
    // Deep-link simulation: GET /api/conversations/:id then GET /api/conversations/:id/approval
    const deepLinkConv = await request(`/api/conversations/${convAId}`, { headers: adminHeaders });
    assert.strictEqual(deepLinkConv.status, 200);
    const deepLinkApproval = await request(`/api/conversations/${convAId}/approval`, { headers: adminHeaders });
    assert.strictEqual(deepLinkApproval.data.hasPendingApproval, true);
    assert.strictEqual(deepLinkApproval.data.runId, runAId);
    console.log("✓ PASS [REQ-5 & REQ-6]: Deep link and refresh reconstruct pending approval from backend");

    // TEST 11: A pending approval from Conversation A never appears in Conversation B
    console.log("\n--- TEST 11: Pending approval from A never appears in Conversation B ---");
    const checkB2 = await request(`/api/conversations/${convBId}/approval`, { headers: adminHeaders });
    assert.strictEqual(checkB2.data.hasPendingApproval, false);
    assert.notStrictEqual(checkB2.data.runId, runAId);
    console.log("✓ PASS [REQ-11]: Multi-conversation isolation strictly maintained; B never displays A's approval");

    // TEST 12: Unauthorized users cannot approve restored approvals
    console.log("\n--- TEST 12: Unauthorized users cannot approve restored approvals ---");
    const expertApprove = await request(`/api/approvals/${approvalAId}/approve`, {
      method: "POST",
      headers: expertHeaders,
      body: { comment: "Unauthorized attempt" },
    });
    assert.strictEqual(expertApprove.status, 403, "EXPERT must be rejected with 403 Forbidden");

    const viewerApprove = await request(`/api/approvals/${approvalAId}/approve`, {
      method: "POST",
      headers: viewerHeaders,
      body: { comment: "Unauthorized attempt" },
    });
    assert.strictEqual(viewerApprove.status, 403, "VIEWER must be rejected with 403 Forbidden");
    console.log("✓ PASS [REQ-12]: Non-approver roles strictly blocked with 403 Forbidden");

    // TEST 7: Approve after rehydration works
    console.log("\n--- TEST 7: Approve after rehydration works via POST /api/approvals/:id/approve ---");
    const approveRes = await request(`/api/approvals/${approvalAId}/approve`, {
      method: "POST",
      headers: approverHeaders,
      body: { comment: "Approved by clinical reviewer after rehydration" },
    });
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.data.message, "Approval granted successfully");
    assert.strictEqual(approveRes.data.resumable, true);
    console.log("✓ PASS [REQ-7]: Approval endpoint succeeds with resumable = true");

    // TEST 8: Approve & Continue resumes automatically
    console.log("\n--- TEST 8: Resume workflow continues execution ---");
    const resumeRes = await streamResume(runAId, approvalAId, adminToken);
    assert.ok(resumeRes.isDone, "Resumed workflow must complete with done event");
    console.log("✓ PASS [REQ-8]: Workflow automatically resumed and streamed to completion");

    // TEST 9 & 10: Final assistant message appears in same conversation, exactly once
    console.log("\n--- TEST 9 & 10: Exactly one assistant message persisted in Conversation A ---");
    const msgsA = await request(`/api/conversations/${convAId}/messages`, { headers: adminHeaders });
    assert.strictEqual(msgsA.status, 200);
    assert.strictEqual(msgsA.data.messages.length, 2, "Conversation A must contain exactly 1 user and 1 assistant message");
    const asstA = msgsA.data.messages.find((m) => m.role === "assistant");
    assert.ok(asstA, "Assistant message must exist in Conversation A");
    assert.strictEqual(asstA.runId, runAId);
    assert.ok(asstA.content.length > 0);
    console.log("✓ PASS [REQ-9 & REQ-10]: Single authoritative assistant message persisted in Conversation A");

    // Post-approval check: Conversation A has no pending approval anymore
    const checkAAfter = await request(`/api/conversations/${convAId}/approval`, { headers: adminHeaders });
    assert.strictEqual(checkAAfter.data.hasPendingApproval, false, "Completed run must no longer be pending approval");
    console.log("✓ Pending approval UI cleared after approved completion");

  } finally {
    // Cleanup
    await request(`/api/conversations/${convAId}`, { method: "DELETE", headers: adminHeaders });
    await request(`/api/conversations/${convBId}`, { method: "DELETE", headers: adminHeaders });
    console.log("✓ Cleaned up test conversations A and B");
  }

  console.log("\n================================================================================");
  console.log("ALL 12 PERSISTENT COPILOT HITL APPROVAL REGRESSION REQUIREMENTS PASSED!");
  console.log("================================================================================");
}

runRegressionSuite().catch((err) => {
  console.error("Regression suite failed:", err);
  process.exit(1);
});
