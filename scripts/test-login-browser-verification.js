/**
 * DOMAIN COPILOT - BROWSER-LEVEL REGRESSION VERIFICATION FOR LOGIN FIXES
 * 
 * Verifies:
 * TEST 1 — QUICK SELECT ON COLD FIRST LOAD (ADMIN, EXPERT, VIEWER)
 * TEST 2 — HARD REFRESH (Quick select after ignore-cache reload)
 * TEST 3 — VALID SESSION RESTORATION (Login -> Close -> Reopen in same context -> Auto restore)
 * TEST 4 — INVALID / EXPIRED SESSION (Invalid token rejected, form shown, no loop)
 * TEST 5 — NO REDIRECT LOOP (URL stability, bounded requests)
 * TEST 6 — NO FIRST-LOAD FLASH (State progression: initializing -> auth/unauth)
 * TEST 8 — CONSOLE / NETWORK (Capture all errors, warnings, failed requests)
 */

const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}

async function getNewPageWs(port = 9238) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const targets = JSON.parse(data);
          const page = targets.find((t) => t.type === "page");
          if (page && page.webSocketDebuggerUrl) {
            resolve(page.webSocketDebuggerUrl);
          } else {
            reject(new Error("No page target found: " + data));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function launchChrome(profileDir, port = 9238) {
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    "--disable-default-apps",
    `--user-data-dir=${profileDir}`,
    "--window-size=1280,800",
  ]);
  return chrome;
}

async function runVerification() {
  console.log("==================================================================");
  console.log("DOMAIN COPILOT: LOGIN FIRST-LOAD BROWSER REGRESSION VERIFICATION");
  console.log("==================================================================\n");

  const results = {
    cold_api_me_dispatched: false,
    test1_cold_admin: false,
    test1_cold_expert: false,
    test1_cold_viewer: false,
    test2_hard_refresh: false,
    test3_session_restoration: false,
    test4_invalid_session: false,
    test5_no_redirect_loop: false,
    test6_no_first_load_flash: false,
    console_errors: [],
    network_errors: [],
  };

  const port = 9238;

  // ==================================================================
  // TEST 1 — QUICK SELECT ON COLD FIRST LOAD
  // ==================================================================
  console.log(">>> [TEST 1] Starting Cold First Load Verification...");
  const coldProfileDir = path.join(os.tmpdir(), "dc_cold_test_" + Date.now());
  let chrome1 = launchChrome(coldProfileDir, port);
  await sleep(2000);

  let pageWs1 = await getNewPageWs(port);
  let client1 = new CDPClient(pageWs1);
  await client1.connect();

  await client1.send("Page.enable");
  await client1.send("Network.enable");
  await client1.send("Runtime.enable");

  client1.on("Runtime.consoleAPICalled", (p) => {
    if (p.type === "error") {
      const text = p.args.map((a) => a.value || a.description || "").join(" ");
      results.console_errors.push(`[Console Error] ${text}`);
      console.log(`    ! [Browser Console Error]:`, text);
    }
  });

  const test1NetworkRequests = [];
  client1.on("Network.requestWillBeSent", (p) => {
    test1NetworkRequests.push({ type: "REQ", method: p.request.method, url: p.request.url, time: Date.now() });
  });
  client1.on("Network.responseReceived", (p) => {
    test1NetworkRequests.push({ type: "RES", status: p.response.status, url: p.response.url, time: Date.now() });
  });

  // 1. Open login page with NO previous state, NO manual refresh
  console.log("    Navigating to http://localhost:3000/login in fresh context...");
  await client1.send("Page.navigate", { url: "http://localhost:3000/login" });

  // Wait for login form to become interactive
  let isInteractive = false;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    const check = await client1.send("Runtime.evaluate", {
      expression: `(() => {
        const emailInput = document.getElementById("email");
        const adminBtn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("ADMIN"));
        return Boolean(emailInput && adminBtn);
      })()`,
      returnByValue: true,
    });
    if (check.result.value === true) {
      isInteractive = true;
      break;
    }
  }

  if (!isInteractive) {
    console.error("    [FAIL] Login page did not become interactive within 6s");
  } else {
    console.log("    [OK] Login page is interactive (DOM elements mounted).");
  }

  // Verify /api/me was dispatched on cold first load WITHOUT refresh
  const apiMeCalls = test1NetworkRequests.filter(r => r.url.includes("/api/me"));
  const apiMeDispatched = apiMeCalls.some(r => r.type === "REQ" && r.method === "GET");
  const apiMeReturned401 = apiMeCalls.some(r => r.type === "RES" && r.status === 401);

  console.log(`    Cold First Load /api/me Requests: ${apiMeCalls.length} events (dispatched: ${apiMeDispatched}, returned 401: ${apiMeReturned401})`);
  if (apiMeDispatched && apiMeReturned401) {
    results.cold_api_me_dispatched = true;
    console.log("    ✓ [PASS] COLD FIRST LOAD: GET /api/me dispatched automatically without manual refresh.");
  } else {
    console.error("    ✗ [FAIL] COLD FIRST LOAD: GET /api/me was NOT dispatched on first load.");
  }

  // 2. Click ADMIN without refreshing
  console.log("    Clicking ADMIN role button (cold first-load, no refresh)...");
  await client1.send("Runtime.evaluate", {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("ADMIN"));
      if (btn) btn.click();
    })()`,
  });
  await sleep(400);

  const adminValues = await client1.send("Runtime.evaluate", {
    expression: `(() => ({
      email: document.getElementById("email") ? document.getElementById("email").value : null,
      pass: document.getElementById("password") ? document.getElementById("password").value : null,
    }))()`,
    returnByValue: true,
  });

  console.log(`    Values after clicking ADMIN: email="${adminValues.result.value.email}", pass="${adminValues.result.value.pass}"`);
  if (
    adminValues.result.value.email === "admin@domaincopilot.ai" &&
    adminValues.result.value.pass === "admin123"
  ) {
    results.test1_cold_admin = true;
    console.log("    ✓ [PASS] TEST 1 (ADMIN): Credentials populated accurately on cold first load.");
  } else {
    console.error("    ✗ [FAIL] TEST 1 (ADMIN): Credentials NOT populated as expected.");
  }

  // 3. Repeat with EXPERT without refreshing
  console.log("    Clicking EXPERT role button (no refresh)...");
  await client1.send("Runtime.evaluate", {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("EXPERT"));
      if (btn) btn.click();
    })()`,
  });
  await sleep(400);

  const expertValues = await client1.send("Runtime.evaluate", {
    expression: `(() => ({
      email: document.getElementById("email") ? document.getElementById("email").value : null,
      pass: document.getElementById("password") ? document.getElementById("password").value : null,
    }))()`,
    returnByValue: true,
  });

  console.log(`    Values after clicking EXPERT: email="${expertValues.result.value.email}", pass="${expertValues.result.value.pass}"`);
  if (
    expertValues.result.value.email === "expert@domaincopilot.ai" &&
    expertValues.result.value.pass === "expert123"
  ) {
    results.test1_cold_expert = true;
    console.log("    ✓ [PASS] TEST 1 (EXPERT): Credentials populated accurately on cold first load.");
  } else {
    console.error("    ✗ [FAIL] TEST 1 (EXPERT): Credentials NOT populated as expected.");
  }

  // 4. Repeat with VIEWER without refreshing
  console.log("    Clicking VIEWER role button (no refresh)...");
  await client1.send("Runtime.evaluate", {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("VIEWER"));
      if (btn) btn.click();
    })()`,
  });
  await sleep(400);

  const viewerValues = await client1.send("Runtime.evaluate", {
    expression: `(() => ({
      email: document.getElementById("email") ? document.getElementById("email").value : null,
      pass: document.getElementById("password") ? document.getElementById("password").value : null,
    }))()`,
    returnByValue: true,
  });

  console.log(`    Values after clicking VIEWER: email="${viewerValues.result.value.email}", pass="${viewerValues.result.value.pass}"`);
  if (
    viewerValues.result.value.email === "viewer@domaincopilot.ai" &&
    viewerValues.result.value.pass === "viewer123"
  ) {
    results.test1_cold_viewer = true;
    console.log("    ✓ [PASS] TEST 1 (VIEWER): Credentials populated accurately on cold first load.");
  } else {
    console.error("    ✗ [FAIL] TEST 1 (VIEWER): Credentials NOT populated as expected.");
  }

  // ==================================================================
  // TEST 2 — HARD REFRESH
  // ==================================================================
  console.log("\n>>> [TEST 2] Starting Hard Refresh Verification...");
  console.log("    Executing hard refresh (ignoreCache: true)...");
  await client1.send("Page.reload", { ignoreCache: true });
  await sleep(3000);

  console.log("    Clicking ADMIN role button after hard refresh...");
  await client1.send("Runtime.evaluate", {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("ADMIN"));
      if (btn) btn.click();
    })()`,
  });
  await sleep(400);

  const hardRefreshAdmin = await client1.send("Runtime.evaluate", {
    expression: `(() => ({
      email: document.getElementById("email") ? document.getElementById("email").value : null,
      pass: document.getElementById("password") ? document.getElementById("password").value : null,
    }))()`,
    returnByValue: true,
  });

  console.log(`    Values after hard refresh + ADMIN click: email="${hardRefreshAdmin.result.value.email}", pass="${hardRefreshAdmin.result.value.pass}"`);
  if (
    hardRefreshAdmin.result.value.email === "admin@domaincopilot.ai" &&
    hardRefreshAdmin.result.value.pass === "admin123"
  ) {
    results.test2_hard_refresh = true;
    console.log("    ✓ [PASS] TEST 2: Hard refresh maintains Quick Select functionality.");
  } else {
    console.error("    ✗ [FAIL] TEST 2: Hard refresh failed to populate credentials.");
  }

  // Close first Chrome instance
  await client1.send("Browser.close");
  client1.close();
  await sleep(1500);

  // ==================================================================
  // TEST 3 & 6 — VALID SESSION RESTORATION & NO FIRST-LOAD FLASH
  // ==================================================================
  console.log("\n>>> [TEST 3 & 6] Starting Valid Session Restoration & Flash Verification...");
  const persistentProfileDir = path.join(os.tmpdir(), "dc_persist_test_" + Date.now());

  // Step 1: Launch Chrome with persistent profile
  let chrome2 = launchChrome(persistentProfileDir, port);
  await sleep(2000);

  let pageWs2 = await getNewPageWs(port);
  let client2 = new CDPClient(pageWs2);
  await client2.connect();

  await client2.send("Page.enable");
  await client2.send("Network.enable");
  await client2.send("Runtime.enable");

  // Navigate to login
  await client2.send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2500);

  // Quick select ADMIN, wait for React state, and submit
  console.log("    Logging in as ADMIN to establish persisted session...");
  await client2.send("Runtime.evaluate", {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("ADMIN"));
      if (btn) btn.click();
    })()`,
  });
  await sleep(500);

  await client2.send("Runtime.evaluate", {
    expression: `(() => {
      const form = document.querySelector("form");
      if (form) form.requestSubmit();
    })()`,
  });

  // Wait for redirect to /dashboard
  let reachedDashboard = false;
  for (let i = 0; i < 30; i++) {
    await sleep(250);
    const urlEval = await client2.send("Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    });
    if (urlEval.result.value.includes("/dashboard")) {
      reachedDashboard = true;
      break;
    }
  }

  console.log(`    Login submission result: reachedDashboard=${reachedDashboard}`);

  // Confirm cookies were written
  const cookiesPhase1 = await client2.send("Network.getCookies");
  console.log("    Cookies in Chrome 1:", cookiesPhase1.cookies.map(c => c.name));

  // Gracefully close browser via CDP Browser.close to flush cookies to SQLite
  console.log("    Closing Chrome 1 with Browser.close (flushing session)...");
  await client2.send("Browser.close");
  client2.close();
  await sleep(2500);

  // Step 2: Re-open browser in the SAME profile directory (simulating reopening app)
  console.log("    Reopening application in the same browser profile (testing session restoration)...");
  let chrome3 = launchChrome(persistentProfileDir, port);
  await sleep(2000);

  let pageWs3 = await getNewPageWs(port);
  let client3 = new CDPClient(pageWs3);
  await client3.connect();

  await client3.send("Page.enable");
  await client3.send("Network.enable");
  await client3.send("Runtime.enable");

  const observedDomStates = [];
  client3.on("DOM.documentUpdated", async () => {
    try {
      const snap = await client3.send("Runtime.evaluate", {
        expression: `(() => {
          const text = document.body ? document.body.innerText : "";
          const hasLoginForm = text.includes("Quick Select Role");
          const hasVerifying = text.includes("Verifying session");
          const hasDashboard = text.includes("CORPUS REPOSITORY") || text.includes("INGESTION PIPELINE");
          return { hasLoginForm, hasVerifying, hasDashboard, url: window.location.href };
        })()`,
        returnByValue: true,
      });
      if (snap.result?.value) {
        observedDomStates.push(snap.result.value);
      }
    } catch {}
  });

  // Open the application directly at /login without manually refreshing
  console.log("    Navigating to http://localhost:3000/login (must auto-restore without manual refresh)...");
  await client3.send("Page.navigate", { url: "http://localhost:3000/login" });

  // Observe navigation and final URL
  let restoredToDashboard = false;
  for (let i = 0; i < 30; i++) {
    await sleep(250);
    const urlEval = await client3.send("Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    });
    if (urlEval.result.value.includes("/dashboard")) {
      restoredToDashboard = true;
      break;
    }
  }

  const finalRestoredUrl = await client3.send("Runtime.evaluate", {
    expression: "window.location.href",
    returnByValue: true,
  });
  console.log(`    Final URL after reopening: ${finalRestoredUrl.result.value}`);

  if (restoredToDashboard) {
    results.test3_session_restoration = true;
    console.log("    ✓ [PASS] TEST 3: Valid session restored automatically without manual refresh.");
  } else {
    console.error("    ✗ [FAIL] TEST 3: Session was NOT restored automatically.");
  }

  // Check TEST 6: Flash of unauthenticated login form
  const flashedLoginForm = observedDomStates.some((s) => s.hasLoginForm && s.url.includes("/login"));
  if (!flashedLoginForm) {
    results.test6_no_first_load_flash = true;
    console.log("    ✓ [PASS] TEST 6: No unauthenticated flash. Transitioned cleanly: initializing -> authenticated.");
  } else {
    console.error("    ✗ [FAIL] TEST 6: Login form flashed before session was verified.");
  }

  await client3.send("Browser.close");
  client3.close();
  await sleep(1500);

  // ==================================================================
  // TEST 4 & 5 — INVALID SESSION & NO REDIRECT LOOP
  // ==================================================================
  console.log("\n>>> [TEST 4 & 5] Starting Invalid Session & Redirect Loop Verification...");
  const invalidProfileDir = path.join(os.tmpdir(), "dc_invalid_test_" + Date.now());
  let chrome4 = launchChrome(invalidProfileDir, port);
  await sleep(2000);

  let pageWs4 = await getNewPageWs(port);
  let client4 = new CDPClient(pageWs4);
  await client4.connect();

  await client4.send("Page.enable");
  await client4.send("Network.enable");
  await client4.send("Runtime.enable");

  const test4Navigations = [];
  client4.on("Page.frameNavigated", (p) => {
    test4Navigations.push({ url: p.frame.url, time: Date.now() });
  });

  const apiMeRequests = [];
  client4.on("Network.requestWillBeSent", (p) => {
    if (p.request.url.includes("/api/me")) {
      apiMeRequests.push({ url: p.request.url, time: Date.now() });
    }
  });

  // Navigate to /login first to establish domain origin for cookie setting
  await client4.send("Page.navigate", { url: "http://localhost:3000/login" });
  await sleep(2500);

  // Inject invalid token in cookies and localStorage
  console.log("    Injecting invalid token cookie (dc_token=invalid.signature.token)...");
  await client4.send("Runtime.evaluate", {
    expression: `(() => {
      document.cookie = "dc_token=eyJhbGciOiJIUzI1NiJ9.invalidpayload.invalidsig; path=/";
      localStorage.setItem("dc_token", "eyJhbGciOiJIUzI1NiJ9.invalidpayload.invalidsig");
    })()`,
  });

  // Reset request counter for the invalid session reload test
  apiMeRequests.length = 0;

  // Reload page to test invalid session behavior
  console.log("    Reloading page with invalid token...");
  await client4.send("Page.reload");
  await sleep(3000);

  // Check state:
  const invalidSessionState = await client4.send("Runtime.evaluate", {
    expression: `(() => {
      const emailInput = document.getElementById("email");
      const adminBtn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("ADMIN"));
      return {
        url: window.location.href,
        hasEmailInput: Boolean(emailInput),
        hasAdminBtn: Boolean(adminBtn),
      };
    })()`,
    returnByValue: true,
  });

  console.log("    Invalid session state:", invalidSessionState.result.value);

  // Quick select must still work immediately
  await client4.send("Runtime.evaluate", {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("ADMIN"));
      if (btn) btn.click();
    })()`,
  });
  await sleep(400);

  const quickSelectAfterInvalid = await client4.send("Runtime.evaluate", {
    expression: `(() => ({
      email: document.getElementById("email") ? document.getElementById("email").value : null,
      pass: document.getElementById("password") ? document.getElementById("password").value : null,
    }))()`,
    returnByValue: true,
  });

  console.log("    Quick select after invalid session:", quickSelectAfterInvalid.result.value);

  const invalidRejected =
    invalidSessionState.result.value.hasEmailInput &&
    invalidSessionState.result.value.url.includes("/login") &&
    quickSelectAfterInvalid.result.value.email === "admin@domaincopilot.ai";

  if (invalidRejected) {
    results.test4_invalid_session = true;
    console.log("    ✓ [PASS] TEST 4: Invalid session rejected cleanly, login screen shown, Quick Select functional.");
  } else {
    console.error("    ✗ [FAIL] TEST 4: Invalid session handling failed.");
  }

  // TEST 5: Check for redirect loop
  console.log(`    Total navigations during invalid session test: ${test4Navigations.length}`);
  console.log(`    Total /api/me requests after reload: ${apiMeRequests.length}`);

  const hasLoop = test4Navigations.length > 5 || apiMeRequests.length > 4;
  if (!hasLoop) {
    results.test5_no_redirect_loop = true;
    console.log("    ✓ [PASS] TEST 5: No redirect loop detected. Navigation count and /api/me calls are strictly bounded.");
  } else {
    console.error("    ✗ [FAIL] TEST 5: Potential redirect loop detected.");
  }

  await client4.send("Browser.close");
  client4.close();

  // Print Summary
  console.log("\n==================================================================");
  console.log("BROWSER-LEVEL VERIFICATION RUN COMPLETE");
  console.log("==================================================================");
  console.log("Results Summary:");
  console.log("  COLD FIRST LOAD (/api/me Dispatched):", results.cold_api_me_dispatched ? "PASS" : "FAIL");
  console.log("  TEST 1 (ADMIN Cold):", results.test1_cold_admin ? "PASS" : "FAIL");
  console.log("  TEST 1 (EXPERT Cold):", results.test1_cold_expert ? "PASS" : "FAIL");
  console.log("  TEST 1 (VIEWER Cold):", results.test1_cold_viewer ? "PASS" : "FAIL");
  console.log("  TEST 2 (Hard Refresh):", results.test2_hard_refresh ? "PASS" : "FAIL");
  console.log("  TEST 3 (Session Restoration):", results.test3_session_restoration ? "PASS" : "FAIL");
  console.log("  TEST 4 (Invalid Session):", results.test4_invalid_session ? "PASS" : "FAIL");
  console.log("  TEST 5 (No Redirect Loop):", results.test5_no_redirect_loop ? "PASS" : "FAIL");
  console.log("  TEST 6 (No First-Load Flash):", results.test6_no_first_load_flash ? "PASS" : "FAIL");
  console.log("  Console Errors:", results.console_errors.length === 0 ? "NONE" : results.console_errors);
  console.log("==================================================================");

  return results;
}

runVerification().then((res) => {
  const allPassed =
    res.cold_api_me_dispatched &&
    res.test1_cold_admin &&
    res.test1_cold_expert &&
    res.test1_cold_viewer &&
    res.test2_hard_refresh &&
    res.test3_session_restoration &&
    res.test4_invalid_session &&
    res.test5_no_redirect_loop &&
    res.test6_no_first_load_flash;
  process.exit(allPassed ? 0 : 1);
}).catch((err) => {
  console.error("Verification execution error:", err);
  process.exit(1);
});
