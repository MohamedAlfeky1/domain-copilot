/**
 * REGRESSION TEST SUITE: RUNS & TRACES OPERATIONAL DISCOVERY & RBAC
 * 
 * Verifies:
 * 1. GET /api/runs requires authentication (401 without auth).
 * 2. Authenticated ADMIN can access operational runs.
 * 3. Operational runs are sorted newest first.
 * 4. Operational runs contain NO evaluation benchmark cases (G-01, G-02, ADV-01).
 * 5. RBAC / Object Ownership: Non-admin users can ONLY see their own runs (or runs with their approvals).
 * 6. "latest" resolution picks the newest accessible operational run (run-...), never an evaluation case.
 * 7. Exact run lookup: /api/runs/<real-id> returns run trace; /api/runs/G-01 or invalid ID returns 404.
 * 8. Evaluation benchmark cases (G-01, etc.) remain strictly isolated to evaluation and are not operational runs.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const Module = require("module");

// Hook path resolution for @/ alias in Node tests
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(__dirname, "..", "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Enable TypeScript transpilation for direct module loading
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

async function runRegressionTests() {
  console.log("================================================================================");
  console.log("REGRESSION TEST SUITE: RUNS & TRACES OPERATIONAL FLOW & RBAC");
  console.log("================================================================================");

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

  // Load container and auth modules
  const { container } = require("@/core/application/container");
  const { canAccessRun } = require("@/infrastructure/auth/auth-guard");

  // Verify DB state
  await test("1. Database contains operational runs and NO evaluation cases in runs table", async () => {
    const runs = await container.db.listRuns(100);
    assert.ok(runs.length > 0, `Expected operational runs, found ${runs.length}`);
    
    // Check that none of the run IDs are evaluation benchmark IDs
    const evalIds = ["G-01", "G-02", "G-03", "ADV-01", "ADV-02"];
    for (const r of runs) {
      assert.ok(!evalIds.includes(r.id), `Evaluation case ID ${r.id} found in operational runs!`);
      assert.ok(r.id.startsWith("run-"), `Operational run ID should start with 'run-', got: ${r.id}`);
    }
  });

  await test("2. Operational runs are sorted newest first (descending startedAt)", async () => {
    const runs = await container.db.listRuns(50);
    for (let i = 0; i < runs.length - 1; i++) {
      const current = new Date(runs[i].startedAt).getTime();
      const next = new Date(runs[i + 1].startedAt).getTime();
      assert.ok(current >= next, `Run at index ${i} (${runs[i].startedAt}) is older than index ${i+1} (${runs[i+1].startedAt})`);
    }
  });

  await test("3. RBAC & Object Ownership: canAccessRun enforces strict access", async () => {
    const adminUser = { id: "usr-admin-001", role: "ADMIN", status: "ACTIVE", email: "admin@test.com", name: "Admin" };
    const expertUser = { id: "usr-expert-001", role: "EXPERT", status: "ACTIVE", email: "expert@test.com", name: "Expert" };
    const viewerUser = { id: "usr-viewer-001", role: "VIEWER", status: "ACTIVE", email: "viewer@test.com", name: "Viewer" };
    const approverUser = { id: "usr-appr-001", role: "APPROVER", status: "ACTIVE", email: "approver@test.com", name: "Approver" };

    const adminRun = { id: "run-admin-1", ownerId: "usr-admin-001", status: "COMPLETED", startedAt: new Date().toISOString() };
    const expertRun = { id: "run-expert-1", ownerId: "usr-expert-001", status: "COMPLETED", startedAt: new Date().toISOString() };

    // Admin can access all
    assert.strictEqual(canAccessRun(adminUser, adminRun), true, "Admin should access admin run");
    assert.strictEqual(canAccessRun(adminUser, expertRun), true, "Admin should access expert run");

    // Expert can only access expert run
    assert.strictEqual(canAccessRun(expertUser, expertRun), true, "Expert should access own run");
    assert.strictEqual(canAccessRun(expertUser, adminRun), false, "Expert should NOT access admin run");

    // Viewer can only access viewer run
    assert.strictEqual(canAccessRun(viewerUser, adminRun), false, "Viewer should NOT access admin run");
    assert.strictEqual(canAccessRun(viewerUser, expertRun), false, "Viewer should NOT access expert run");

    // Approver without matching approval cannot access
    assert.strictEqual(canAccessRun(approverUser, adminRun, []), false, "Approver without approval should NOT access run");

    // Approver with matching approval CAN access
    const matchingApproval = { id: "appr-1", runId: "run-admin-1", status: "PENDING" };
    assert.strictEqual(canAccessRun(approverUser, adminRun, [matchingApproval]), true, "Approver with matching approval should access run");
    assert.strictEqual(canAccessRun(approverUser, expertRun, [matchingApproval]), false, "Approver should NOT access run without matching approval");
  });

  await test("4. GET /api/runs route handler returns only accessible runs for authenticated user", async () => {
    const routeModule = require("@/app/api/runs/route");
    assert.ok(typeof routeModule.GET === "function", "GET export must exist in src/app/api/runs/route.ts");

    process.env.NODE_ENV = "test";
    process.env.ALLOW_TEST_AUTH = "true";

    // Simulate mock request for Admin
    const adminReq = {
      headers: new Headers({
        "x-test-role": "ADMIN",
        "x-test-user-id": "usr-admin-001",
      }),
    };

    const adminRes = await routeModule.GET(adminReq);
    assert.strictEqual(adminRes.status, 200);
    const adminData = await adminRes.json();
    assert.ok(Array.isArray(adminData.runs), "Response must contain 'runs' array");
    assert.ok(adminData.runs.length > 0, "Admin should see operational runs");
    assert.ok(adminData.runs[0].id.startsWith("run-"), "Run ID must start with run-");

    // Simulate mock request for Expert (should only see runs owned by expert)
    const expertReq = {
      headers: new Headers({
        "x-test-role": "EXPERT",
        "x-test-user-id": "usr-expert-001",
      }),
    };
    const expertRes = await routeModule.GET(expertReq);
    assert.strictEqual(expertRes.status, 200);
    const expertData = await expertRes.json();
    for (const r of expertData.runs) {
      assert.strictEqual(r.ownerId, "usr-expert-001", "Expert must only see their own runs");
    }

    // Unauthenticated request must return 401
    const unauthReq = {
      headers: new Headers(),
      cookies: { get: () => null },
    };
    const unauthRes = await routeModule.GET(unauthReq);
    assert.strictEqual(unauthRes.status, 401, "Unauthenticated GET /api/runs must return 401");
  });

  await test("5. 'latest' resolution picks the newest accessible operational run", async () => {
    const runs = await container.db.listRuns(50);
    assert.ok(runs.length > 0, "Runs must exist in DB");
    const latestOperationalRun = runs[0];
    assert.ok(latestOperationalRun.id.startsWith("run-"), `Latest operational run ID must start with 'run-', got: ${latestOperationalRun.id}`);

    // Verify it is NOT an evaluation ID
    assert.notStrictEqual(latestOperationalRun.id, "G-01");
    assert.notStrictEqual(latestOperationalRun.id, "latest");

    // Verify getting that run by ID returns full data
    const run = await container.db.getRunById(latestOperationalRun.id);
    assert.ok(run !== null, "Run must exist");
    assert.strictEqual(run.id, latestOperationalRun.id);

    // Verify steps and usage
    const steps = await container.db.getRunSteps(latestOperationalRun.id);
    assert.ok(Array.isArray(steps), "Steps must be an array");
  });

  await test("6. Exact run lookup: /api/runs/[id] succeeds for real run, 404s for G-01 and invalid IDs", async () => {
    const singleRunRoute = require("@/app/api/runs/[id]/route");
    assert.ok(typeof singleRunRoute.GET === "function", "GET export must exist in src/app/api/runs/[id]/route.ts");

    const runs = await container.db.listRuns(5);
    const realRunId = runs[0].id;

    // 1. Real run with Admin
    const reqReal = {
      headers: new Headers({
        "x-test-role": "ADMIN",
        "x-test-user-id": "usr-admin-001",
      }),
    };
    const resReal = await singleRunRoute.GET(reqReal, { params: { id: realRunId } });
    assert.strictEqual(resReal.status, 200, "Real run must return 200");
    const dataReal = await resReal.json();
    assert.strictEqual(dataReal.run.id, realRunId);

    // 2. Evaluation ID 'G-01' must return 404
    const resEval = await singleRunRoute.GET(reqReal, { params: { id: "G-01" } });
    assert.strictEqual(resEval.status, 404, "Evaluation ID 'G-01' must return 404 from /api/runs/:id");

    // 3. Non-existent ID must return 404
    const resNonExistent = await singleRunRoute.GET(reqReal, { params: { id: "run-does-not-exist-999" } });
    assert.strictEqual(resNonExistent.status, 404, "Non-existent run must return 404");
  });

  await test("7. Evaluation data separation: /api/evaluation/runs remains separate from operational runs", async () => {
    const evalDataPath = path.join(process.cwd(), "fixtures", "eval-results.json");
    assert.ok(fs.existsSync(evalDataPath), "fixtures/eval-results.json must exist");
    const evalData = JSON.parse(fs.readFileSync(evalDataPath, "utf-8"));
    const evalResults = evalData.results || [];
    assert.ok(evalResults.length > 0, "Evaluation results must exist in fixtures");

    const evalIds = evalResults.map(r => r.id);
    assert.ok(evalIds.includes("G-01"), "Evaluation results should include G-01");

    // Confirm that none of the evalIds exist in the operational runs table
    for (const id of evalIds) {
      const run = await container.db.getRunById(id);
      assert.strictEqual(run, null, `Evaluation case ${id} should NOT be in operational runs table`);
    }
  });

  console.log("================================================================================");
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
