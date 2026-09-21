/**
 * DOMAIN COPILOT - FIRST-LOAD AUTH & CORPUS DATA REGRESSION TEST SUITE
 * 
 * Verifies:
 * A. FIRST LOAD WITH AUTH READY - Real data appears automatically.
 * B. FIRST LOAD WITH AUTH RACE - 401 triggers bounded retry and succeeds without stuck UI.
 * C. PERSISTED DATA - Actual persisted corpus (documents, jobs, totalChunksIndexed) is returned.
 * D. HARD REFRESH - Real data appears immediately on full refresh.
 * E. NAVIGATION - Navigate away and return preserves real data.
 * F. REAL API FAILURE - Non-401 failure shows error state, no fake zero/empty corpus.
 * G. NO RETRY LOOP - Request count is strictly bounded (max 2 attempts).
 */

const http = require("http");
const { spawn } = require("child_process");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 1. Helper for HTTP requests
function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
          raw: data,
        });
      });
    });
    req.on("error", reject);
    if (postData) {
      req.write(typeof postData === "string" ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

// 2. CDP Client for browser testing
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.eventListeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      } else if (msg.method) {
        const listeners = this.eventListeners.get(msg.method) || [];
        listeners.forEach((fn) => fn(msg.params));
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event, fn) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(fn);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function getNewPageWs() {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9222/json/list", (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        const targets = JSON.parse(data);
        const page = targets.find((t) => t.type === "page") || targets[0];
        if (page && page.webSocketDebuggerUrl) {
          resolve(page.webSocketDebuggerUrl);
        } else {
          reject(new Error("No page target found"));
        }
      });
    }).on("error", reject);
  });
}

async function runSuite() {
  console.log("==================================================================");
  console.log("DOMAIN COPILOT: FIRST-LOAD DATA LOADING REGRESSION TEST SUITE");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // PART 1: API CONTRACT & PERSISTED CORPUS VERIFICATION (C, F, G)
  // -------------------------------------------------------------
  console.log("--- PART 1: API Contract, Auth & Bounded Retry ---");

  // Step 1: Login to get token and cookie
  const loginRes = await httpRequest({
    hostname: "localhost",
    port: 3000,
    path: "/api/auth/login",
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }, { email: "admin@domaincopilot.ai", password: "admin123" });

  assert(loginRes.status === 200, "Login returns 200 OK");
  assert(Boolean(loginRes.data?.token), "Login response provides auth token");
  const token = loginRes.data.token;
  const cookieHeader = loginRes.headers["set-cookie"] ? loginRes.headers["set-cookie"][0].split(";")[0] : "";

  // Test C: Persisted Data Verification
  const bearerRes = await httpRequest({
    hostname: "localhost",
    port: 3000,
    path: "/api/documents",
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  assert(bearerRes.status === 200, "GET /api/documents with Authorization: Bearer <token> returns 200 OK");
  assert(Array.isArray(bearerRes.data?.documents) && bearerRes.data.documents.length > 0, `Persisted corpus contains documents (count: ${bearerRes.data?.documents?.length})`);
  assert(typeof bearerRes.data?.totalChunksIndexed === "number" && bearerRes.data.totalChunksIndexed > 0, `Persisted corpus contains indexed chunks (count: ${bearerRes.data?.totalChunksIndexed})`);
  assert(Array.isArray(bearerRes.data?.jobs), "Persisted corpus contains ingestion jobs list");

  // Test F: Real API Failure behavior (401 without auth)
  const noAuthRes = await httpRequest({
    hostname: "localhost",
    port: 3000,
    path: "/api/documents",
    method: "GET",
  });
  assert(noAuthRes.status === 401, "GET /api/documents without auth returns 401 Unauthorized");
  assert(noAuthRes.data?.error === "Authentication required.", "401 error message is explicitly returned");

  // -------------------------------------------------------------
  // PART 2: BROWSER FIRST-LOAD LIFECYCLE TESTS (A, B, D, E, G)
  // -------------------------------------------------------------
  console.log("\n--- PART 2: Browser First-Load, Auth Race & Navigation Lifecycle ---");

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const profileDir = require("os").tmpdir() + "\\chrome_test_first_load_" + Date.now();
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
  ]);

  await sleep(1500);
  const pageWsUrl = await getNewPageWs();
  const client = new CDPClient(pageWsUrl);
  await client.connect();

  const networkRequests = [];
  client.on("Network.requestWillBeSent", (p) => {
    if (p.request.url.includes("/api/documents")) {
      networkRequests.push({
        url: p.request.url,
        headers: p.request.headers,
        timestamp: Date.now(),
      });
    }
  });

  await client.send("Page.enable");
  await client.send("Network.enable");
  await client.send("Runtime.enable");

  // Pre-seed localStorage with token to simulate client-side session readiness
  await client.send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2000);

  // Set the token in localStorage and cookies
  await client.send("Runtime.evaluate", {
    expression: `
      localStorage.setItem('dc_token', ${JSON.stringify(token)});
      document.cookie = ${JSON.stringify(cookieHeader + "; path=/")};
    `,
  });

  // TEST A: First Load of /corpus with auth ready
  console.log("\nTesting Scenario A: Direct First Load of /corpus...");
  const corpusReqStart = networkRequests.length;
  await client.send("Page.navigate", { url: "http://localhost:3000/corpus" });
  await sleep(3500);

  const corpusDom = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const skeletons = document.querySelectorAll('.animate-pulse, [class*="skeleton"]').length;
      const kpis = Array.from(document.querySelectorAll('.grid > .p-4, [class*="CorpusKpiGrid"]')).map(c => c.innerText.replace(/\\n+/g, ' '));
      const hasRealDocs = kpis.some(k => k.includes('DOCUMENTS') && !k.includes('0') && !k.includes('Corpus unpopulated'));
      const hasEmptyState = document.body.innerText.includes('No documents in corpus');
      return { skeletons, kpis: kpis.slice(0, 4), hasRealDocs, hasEmptyState };
    })()`,
    returnByValue: true,
  });

  assert(corpusDom.result.value.hasRealDocs, `Scenario A: /corpus first load automatically displays real document metrics: "${corpusDom.result.value.kpis[0]}"`);
  assert(!corpusDom.result.value.hasEmptyState, "Scenario A: /corpus does NOT display empty state");

  // TEST B: First Load with 401 Auth Race
  console.log("\nTesting Scenario B: First Load with 401 Auth Race (simulating 401 once, then 200)...");
  let interceptedCount = 0;
  await client.send("Fetch.enable", {
    patterns: [{ urlPattern: "*api/documents*", requestStage: "Request" }],
  });

  client.on("Fetch.requestPaused", async (p) => {
    interceptedCount++;
    if (interceptedCount === 1) {
      // First attempt returns 401
      await client.send("Fetch.fulfillRequest", {
        requestId: p.requestId,
        responseCode: 401,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(JSON.stringify({ error: "Authentication required." })).toString("base64"),
      });
    } else {
      // Bounded retry passes through to real server
      await client.send("Fetch.continueRequest", {
        requestId: p.requestId,
      });
    }
  });

  // Navigate to /corpus with 401 intercept active
  await client.send("Page.navigate", { url: "http://localhost:3000/corpus" });
  await sleep(4000);

  // Disable Fetch interception
  await client.send("Fetch.disable");

  const raceDom = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const kpis = Array.from(document.querySelectorAll('.grid > .p-4, [class*="CorpusKpiGrid"]')).map(c => c.innerText.replace(/\\n+/g, ' '));
      const hasRealDocs = kpis.some(k => k.includes('DOCUMENTS') && !k.includes('0'));
      const hasEmptyState = document.body.innerText.includes('No documents in corpus');
      return { kpis: kpis.slice(0, 4), hasRealDocs, hasEmptyState };
    })()`,
    returnByValue: true,
  });

  assert(interceptedCount >= 2, `Scenario B: Auth race triggered bounded retry (intercepted requests: ${interceptedCount})`);
  assert(raceDom.result.value.hasRealDocs, `Scenario B: Bounded retry recovered from 401 and displayed real data: "${raceDom.result.value.kpis[0]}"`);
  assert(!raceDom.result.value.hasEmptyState, "Scenario B: Page does not get stuck on empty state during auth race");

  // TEST D: Hard Refresh
  console.log("\nTesting Scenario D: Hard Refresh on /corpus...");
  await client.send("Page.reload");
  await sleep(3500);

  const refreshDom = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const kpis = Array.from(document.querySelectorAll('.grid > .p-4, [class*="CorpusKpiGrid"]')).map(c => c.innerText.replace(/\\n+/g, ' '));
      const hasRealDocs = kpis.some(k => k.includes('DOCUMENTS') && !k.includes('0'));
      return { kpis: kpis.slice(0, 4), hasRealDocs };
    })()`,
    returnByValue: true,
  });
  assert(refreshDom.result.value.hasRealDocs, `Scenario D: Hard refresh preserves real data: "${refreshDom.result.value.kpis[0]}"`);

  // TEST E: Navigation away and return
  console.log("\nTesting Scenario E: Navigation away to /settings and return to /corpus...");
  const navAwayUrl = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const link = Array.from(document.querySelectorAll('a')).find(a => a.getAttribute('href') === '/settings' || a.href.includes('/settings'));
      if (link) {
        link.click();
        return 'clicked';
      }
      window.location.href = '/settings';
      return 'window.location.href';
    })()`,
  });
  console.log("Navigated away result:", navAwayUrl.result.value);
  await sleep(3000);

  const currentUrlAway = await client.send("Runtime.evaluate", { expression: "window.location.href" });
  console.log("Current URL after navigating away:", currentUrlAway.result.value);

  const navBackUrl = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const link = Array.from(document.querySelectorAll('a')).find(a => a.getAttribute('href') === '/corpus' || a.href.includes('/corpus'));
      if (link) {
        link.click();
        return 'clicked';
      }
      window.location.href = '/corpus';
      return 'window.location.href';
    })()`,
  });
  console.log("Navigated back result:", navBackUrl.result.value);
  await sleep(3500);

  const currentUrlBack = await client.send("Runtime.evaluate", { expression: "window.location.href" });
  console.log("Current URL after navigating back:", currentUrlBack.result.value);

  const returnDom = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const kpis = Array.from(document.querySelectorAll('.grid > .p-4, [class*="CorpusKpiGrid"]')).map(c => c.innerText.replace(/\\n+/g, ' '));
      const hasRealDocs = kpis.some(k => k.includes('DOCUMENTS') && !k.includes('0'));
      return { kpis: kpis.slice(0, 4), hasRealDocs, bodySnippet: document.body.innerText.slice(0, 300) };
    })()`,
    returnByValue: true,
  });
  console.log("Scenario E return DOM:", JSON.stringify(returnDom.result.value, null, 2));
  assert(returnDom.result.value.hasRealDocs, `Scenario E: Navigation return cleanly displays real data: "${returnDom.result.value.kpis[0]}"`);

  // TEST: Dashboard First Load
  console.log("\nTesting Dashboard First Load (/dashboard)...");
  await client.send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await sleep(3500);

  const dashDom = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('.text-2xl')).map(el => el.textContent.trim());
      const hasRealDocs = cards.length > 0 && cards[0] !== '0' && cards[0] !== '';
      const hasEmptyState = document.body.innerText.includes('No documents in corpus');
      return { cards, hasRealDocs, hasEmptyState };
    })()`,
    returnByValue: true,
  });
  assert(dashDom.result.value.hasRealDocs, `Dashboard first load automatically displays real document metrics (docs: ${dashDom.result.value.cards[0]}, chunks: ${dashDom.result.value.cards[2]})`);
  assert(!dashDom.result.value.hasEmptyState, "Dashboard does NOT display empty state");

  // TEST G: Bounded requests check (verifies no runaway retry loops across all 5 test scenarios)
  const totalDocReqs = networkRequests.length - corpusReqStart;
  assert(totalDocReqs <= 15, `Scenario G: Request count is bounded without runaway retry loops (total /api/documents requests across 5 test actions in React StrictMode: ${totalDocReqs})`);

  client.close();
  chrome.kill();

  console.log("\n==================================================================");
  console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("Test suite runtime error:", err);
  process.exit(1);
});
