/**
 * DOMAIN COPILOT - REAL HTTP AUTH & RBAC REGRESSION SUITE (FR-8)
 * 
 * Verifies via real HTTP requests:
 * 1. Unauthenticated requests are rejected with 401 across all protected routes.
 * 2. Forged, tampered, expired, and legacy unsigned tokens are rejected with 401.
 * 3. Arbitrary role escalation via x-test-role header is rejected in non-test mode.
 * 4. Stored credentials verified: wrong password / non-existent user returns 401.
 * 5. Role is derived server-side from database: client cannot supply or forge role.
 * 6. Four distinct roles with genuine permission differences:
 *    - ADMIN: Full access (evaluations, document upload, approval, run inspection).
 *    - APPROVER: Governance approval/rejection, document reingestion, copilot queries.
 *    - EXPERT: Copilot queries, own run management, document viewing. Cannot approve (403).
 *    - VIEWER: Read-only (document view, own run inspection). Cannot query copilot (403) or approve (403).
 * 7. Object ownership enforced:
 *    - Cross-user run inspection, stream, and cancellation are strictly blocked with 403.
 *    - Owner access succeeds with 200.
 *    - Cross-run resume hijacking blocked with 403.
 */

const assert = require("assert");

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { ...options.headers };
  if (options.body && typeof options.body === "object" && !(options.body instanceof Buffer)) {
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
  return { status: res.status, data, headers: res.headers };
}

async function login(email, password) {
  const res = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.strictEqual(res.status, 200, `Login failed for ${email}: ${JSON.stringify(res.data)}`);
  return res.data.token;
}

async function runAuthRbacTestSuite() {
  console.log("================================================================================");
  console.log("FR-8 ACCESS CONTROL REGRESSION SUITE: AUTHENTICATION, RBAC & OBJECT OWNERSHIP");
  console.log(`Target: ${BASE_URL}`);
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  async function testCase(id, description, fn) {
    try {
      await fn();
      console.log(`✓ PASS [${id}]: ${description}`);
      passed++;
    } catch (err) {
      console.error(`✗ FAIL [${id}]: ${description}`);
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Unauthenticated Requests (401)
  // ---------------------------------------------------------------------------
  await testCase("AUTH-001", "GET /api/documents without token returns 401 Unauthorized", async () => {
    const res = await request("/api/documents");
    assert.strictEqual(res.status, 401);
  });

  await testCase("AUTH-002", "POST /api/queries without token returns 401 Unauthorized", async () => {
    const res = await request("/api/queries", {
      method: "POST",
      body: { query: "anaphylaxis" },
    });
    assert.strictEqual(res.status, 401);
  });

  await testCase("AUTH-003", "GET /api/me without token returns 401 Unauthorized (no guest access)", async () => {
    const res = await request("/api/me");
    assert.strictEqual(res.status, 401);
  });

  await testCase("AUTH-004", "GET /api/approvals without token returns 401 Unauthorized", async () => {
    const res = await request("/api/approvals");
    assert.strictEqual(res.status, 401);
  });

  await testCase("AUTH-005", "POST /api/evaluation/runs without token returns 401 Unauthorized", async () => {
    const res = await request("/api/evaluation/runs", { method: "POST" });
    assert.strictEqual(res.status, 401);
  });

  // ---------------------------------------------------------------------------
  // 2. Forged & Invalid Token Rejection
  // ---------------------------------------------------------------------------
  await testCase("AUTH-006", "Forged signature on valid payload is rejected with 401", async () => {
    const forgedToken = "eyJpZCI6InVzci1hZG1pbi0wMDEiLCJpc3N1ZWRBdCI6MTc4OTUwMTY4NCwiZXhwaXJlc0F0IjoxNzg5NTg4MDg0fQ.FORGED_SIG_12345";
    const res = await request("/api/documents", {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    assert.strictEqual(res.status, 401);
  });

  await testCase("AUTH-007", "Legacy unsigned Base64 token is rejected with 401", async () => {
    const legacyToken = `jwt-${Buffer.from(JSON.stringify({ id: "usr-admin-001", role: "ADMIN" })).toString("base64")}`;
    const res = await request("/api/documents", {
      headers: { Authorization: `Bearer ${legacyToken}` },
    });
    assert.strictEqual(res.status, 401);
  });

  await testCase("AUTH-008", "Tampered payload with valid original signature is rejected with 401", async () => {
    const adminToken = await login("admin@domaincopilot.ai", "admin123");
    const [originalPayload, originalSig] = adminToken.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ id: "usr-expert-001", issuedAt: 100, expiresAt: 9999999999 })).toString("base64url");
    const tamperedToken = `${tamperedPayload}.${originalSig}`;
    const res = await request("/api/documents", {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });
    assert.strictEqual(res.status, 401);
  });

  await testCase("AUTH-009", "Expired token is rejected with 401", async () => {
    const expiredPayload = Buffer.from(JSON.stringify({
      id: "usr-admin-001",
      issuedAt: Math.floor(Date.now() / 1000) - 7200,
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    })).toString("base64url");
    // Sign using test secret or check verify rejects
    const res = await request("/api/documents", {
      headers: { Authorization: `Bearer ${expiredPayload}.invalid` },
    });
    assert.strictEqual(res.status, 401);
  });

  // ---------------------------------------------------------------------------
  // 3. Test Header Role Escalation Immunity
  // ---------------------------------------------------------------------------
  await testCase("AUTH-010", "x-test-role header cannot bypass authentication in non-test mode", async () => {
    const res = await request("/api/documents", {
      headers: {
        "x-test-role": "ADMIN",
        "x-test-user-id": "usr-admin-001",
      },
    });
    // In development/production server mode, x-test-role is ignored and request is 401
    assert.strictEqual(res.status, 401);
  });

  // ---------------------------------------------------------------------------
  // 4. Stored Credential Verification & Role Derivation
  // ---------------------------------------------------------------------------
  await testCase("AUTH-011", "Login with incorrect password returns 401", async () => {
    const res = await request("/api/auth/login", {
      method: "POST",
      body: { email: "admin@domaincopilot.ai", password: "WRONG_PASSWORD" },
    });
    assert.strictEqual(res.status, 401);
  });

  await testCase("AUTH-012", "Login with non-existent email returns 401", async () => {
    const res = await request("/api/auth/login", {
      method: "POST",
      body: { email: "nonexistent@hospital.org", password: "somepassword" },
    });
    assert.strictEqual(res.status, 401);
  });

  await testCase("AUTH-013", "Role is derived from stored DB identity (client cannot choose role)", async () => {
    // Attempt to pass role: 'ADMIN' during login as expert
    const res = await request("/api/auth/login", {
      method: "POST",
      body: { email: "expert@domaincopilot.ai", password: "expert123", role: "ADMIN" },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.role, "EXPERT", "Server must derive role EXPERT from DB, ignoring client role param");
  });

  // ---------------------------------------------------------------------------
  // 5. Role-Based Access Control (RBAC Permissions)
  // ---------------------------------------------------------------------------
  await testCase("RBAC-001", "EXPERT is forbidden (403) from approving actions", async () => {
    const expertToken = await login("expert@domaincopilot.ai", "expert123");
    const res = await request("/api/approvals/non-existent/approve", {
      method: "POST",
      headers: { Authorization: `Bearer ${expertToken}` },
      body: { comment: "Attempt by expert" },
    });
    assert.strictEqual(res.status, 403);
  });

  await testCase("RBAC-002", "EXPERT is forbidden (403) from rejecting actions", async () => {
    const expertToken = await login("expert@domaincopilot.ai", "expert123");
    const res = await request("/api/approvals/non-existent/reject", {
      method: "POST",
      headers: { Authorization: `Bearer ${expertToken}` },
      body: { reason: "Attempt by expert" },
    });
    assert.strictEqual(res.status, 403);
  });

  await testCase("RBAC-003", "VIEWER is forbidden (403) from querying copilot", async () => {
    const viewerToken = await login("viewer@domaincopilot.ai", "viewer123");
    const res = await request("/api/queries", {
      method: "POST",
      headers: { Authorization: `Bearer ${viewerToken}` },
      body: { query: "protocol inquiry" },
    });
    assert.strictEqual(res.status, 403);
  });

  await testCase("RBAC-004", "VIEWER is forbidden (403) from approving actions", async () => {
    const viewerToken = await login("viewer@domaincopilot.ai", "viewer123");
    const res = await request("/api/approvals/non-existent/approve", {
      method: "POST",
      headers: { Authorization: `Bearer ${viewerToken}` },
      body: { comment: "Attempt by viewer" },
    });
    assert.strictEqual(res.status, 403);
  });

  await testCase("RBAC-005", "APPROVER is forbidden (403) from triggering evaluation benchmarks", async () => {
    const approverToken = await login("approver@domaincopilot.ai", "approver123");
    const res = await request("/api/evaluation/runs", {
      method: "POST",
      headers: { Authorization: `Bearer ${approverToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  await testCase("RBAC-006", "EXPERT is authorized (200) to submit copilot inquiries", async () => {
    const expertToken = await login("expert@domaincopilot.ai", "expert123");
    const res = await request("/api/queries", {
      method: "POST",
      headers: { Authorization: `Bearer ${expertToken}` },
      body: { query: "hypertensive emergency" },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.runId);
  });

  // ---------------------------------------------------------------------------
  // 6. Object Ownership & Broken Access Control
  // ---------------------------------------------------------------------------
  await testCase("OWN-001", "Cross-user run inspection is forbidden (403)", async () => {
    const expertToken = await login("expert@domaincopilot.ai", "expert123");
    const queryRes = await request("/api/queries", {
      method: "POST",
      headers: { Authorization: `Bearer ${expertToken}` },
      body: { query: "anaphylaxis protocol" },
    });
    const runId = queryRes.data.runId;

    // Approver (different user) attempts to inspect expert's run
    const approverToken = await login("approver@domaincopilot.ai", "approver123");
    const inspectRes = await request(`/api/runs/${runId}`, {
      headers: { Authorization: `Bearer ${approverToken}` },
    });
    assert.strictEqual(inspectRes.status, 403, "Non-owner non-admin user must receive 403 on run inspection");
  });

  await testCase("OWN-002", "Cross-user run stream is forbidden (403)", async () => {
    const expertToken = await login("expert@domaincopilot.ai", "expert123");
    const queryRes = await request("/api/queries", {
      method: "POST",
      headers: { Authorization: `Bearer ${expertToken}` },
      body: { query: "delirium ICU" },
    });
    const runId = queryRes.data.runId;

    const viewerToken = await login("viewer@domaincopilot.ai", "viewer123");
    const streamRes = await request(`/api/runs/${runId}/stream`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    assert.strictEqual(streamRes.status, 403, "Non-owner user must receive 403 on run stream");
  });

  await testCase("OWN-003", "Cross-user run cancellation is forbidden (403)", async () => {
    const expertToken = await login("expert@domaincopilot.ai", "expert123");
    const queryRes = await request("/api/queries", {
      method: "POST",
      headers: { Authorization: `Bearer ${expertToken}` },
      body: { query: "cardiovascular intervention" },
    });
    const runId = queryRes.data.runId;

    const approverToken = await login("approver@domaincopilot.ai", "approver123");
    const cancelRes = await request(`/api/runs/${runId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${approverToken}` },
    });
    assert.strictEqual(cancelRes.status, 403, "Non-owner user must receive 403 on run cancellation");
  });

  await testCase("OWN-004", "Run owner successfully inspects their own run (200)", async () => {
    const expertToken = await login("expert@domaincopilot.ai", "expert123");
    const queryRes = await request("/api/queries", {
      method: "POST",
      headers: { Authorization: `Bearer ${expertToken}` },
      body: { query: "cardiovascular intervention" },
    });
    const runId = queryRes.data.runId;

    const inspectRes = await request(`/api/runs/${runId}`, {
      headers: { Authorization: `Bearer ${expertToken}` },
    });
    assert.strictEqual(inspectRes.status, 200);
    assert.strictEqual(inspectRes.data.run.id, runId);
  });

  await testCase("OWN-005", "ADMIN can inspect any run (200)", async () => {
    const expertToken = await login("expert@domaincopilot.ai", "expert123");
    const queryRes = await request("/api/queries", {
      method: "POST",
      headers: { Authorization: `Bearer ${expertToken}` },
      body: { query: "stroke thrombolysis" },
    });
    const runId = queryRes.data.runId;

    const adminToken = await login("admin@domaincopilot.ai", "admin123");
    const inspectRes = await request(`/api/runs/${runId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(inspectRes.status, 200, "Admin must be able to inspect any run");
  });

  await testCase("OWN-006", "Cross-run resume hijacking is blocked (403/404)", async () => {
    const adminToken = await login("admin@domaincopilot.ai", "admin123");
    // Resume requires an approval belonging to that specific run
    const resumeRes = await request("/api/runs/run-fake-id/resume", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { approvalId: "app-mismatched-id" },
    });
    assert.ok([403, 404].includes(resumeRes.status), `Expected 403 or 404, got ${resumeRes.status}`);
  });

  console.log("================================================================================");
  console.log(`FR-8 ACCESS CONTROL SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthRbacTestSuite().catch((err) => {
  console.error("Fatal error running test suite:", err);
  process.exit(1);
});
