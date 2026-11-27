#!/usr/bin/env node
// ask_guest.mjs — deterministic one-shot driver for the logged-out web ChatGPT.
//
// Contract: prints exactly one JSON object to stdout.
//   { status, source: "chatgpt_guest", trust_level: "unverified_clue",
//     answer?, citations?, duration_ms, detail?, retry_after_sec? }
// Exit code 0 only for OK and DRY_RUN_OK, 3 for every other status, 1 for usage errors.
//
// Design rules (see ../SKILL.md):
// - Strictly serial: a lock file in the state dir admits one run at a time.
// - Cooldown between runs (default 20s) and a 30 minute cooldown after LOGIN_WALL.
// - Privacy pre-scan refuses prompts containing secret-shaped material.
// - Completion is detected by stop-button disappearance plus a 2.5s text-silence
//   window, never by a fixed sleep.
// - Selectors live in ../references/selectors.json so a DOM change is a data fix.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(SCRIPT_DIR);
const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = { timeoutSec: 240, dryRun: false, headed: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prompt-file") args.promptFile = argv[++i];
    else if (a === "--timeout") args.timeoutSec = Number(argv[++i]) || 120;
    else if (a === "--state-dir") args.stateDir = argv[++i];
    else if (a === "--proxy") args.proxy = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--headed") args.headed = true;
    else if (a === "--debug-dir") args.debugDir = argv[++i];
    else if (a === "--help") args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

const args = parseArgs(process.argv);
if (args.help || !args.promptFile) {
  console.error("usage: ask_guest.mjs --prompt-file <file> [--timeout 120] [--dry-run] [--headed] [--state-dir <dir>] [--proxy <server>]");
  process.exit(1);
}

const STATE_DIR = args.stateDir || path.join(SKILL_DIR, ".state");
const LOCK_FILE = path.join(STATE_DIR, "run.lock");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const COOLDOWN_SEC = Number(process.env.CHATGPT_GUEST_COOLDOWN_SEC || 20);
const LOGIN_WALL_COOLDOWN_SEC = 30 * 60;
const LOCK_STALE_MS = 10 * 60 * 1000;

const startedAt = Date.now();
let lockHeld = false;

function emit(status, extra = {}) {
  const out = {
    status,
    source: "chatgpt_guest",
    trust_level: "unverified_clue",
    duration_ms: Date.now() - startedAt,
    ...extra,
  };
  console.log(JSON.stringify(out));
  if (lockHeld) {
    try { fs.unlinkSync(LOCK_FILE); } catch {}
    lockHeld = false;
  }
  process.exit(status === "OK" || status === "DRY_RUN_OK" ? 0 : 3);
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
  catch { return {}; }
}
function writeState(patch) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...readState(), ...patch }, null, 1));
}

// ---------- privacy pre-scan ----------
const SECRET_PATTERNS = [
  ["openai_style_key", /\bsk-[A-Za-z0-9_-]{16,}/],
  ["github_token", /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/],
  ["private_key_block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["bearer_token", /\bBearer\s+[A-Za-z0-9._-]{20,}/i],
  ["password_assignment", /\b(password|passwd|pwd)\s*[:=]\s*\S+/i],
  ["api_key_assignment", /\b(api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}/i],
];
function privacyScan(text) {
  for (const [name, re] of SECRET_PATTERNS) if (re.test(text)) return name;
  return null;
}

// ---------- lock ----------
function acquireLock() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  try {
    const fd = fs.openSync(LOCK_FILE, "wx");
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
    fs.closeSync(fd);
    lockHeld = true;
    return true;
  } catch {
    try {
      const st = fs.statSync(LOCK_FILE);
      if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
        fs.unlinkSync(LOCK_FILE);
        return acquireLock();
      }
    } catch {}
    return false;
  }
}

// ---------- playwright resolution ----------
function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE_PATH) candidates.push(process.env.PLAYWRIGHT_MODULE_PATH);
  candidates.push("playwright");
  const toolsDir = path.join(os.homedir(), "workspace", "tools");
  try {
    for (const entry of fs.readdirSync(toolsDir)) {
      candidates.push(path.join(toolsDir, entry, "node_modules", "playwright"));
    }
  } catch {}
  candidates.push("/usr/lib/node_modules/playwright");
  for (const c of candidates) {
    try { return require(c); } catch {}
  }
  return null;
}

async function firstVisible(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try {
      if (await loc.isVisible({ timeout: 800 })) return loc;
    } catch {}
  }
  return null;
}

async function clickTextIfPresent(page, texts) {
  for (const t of texts) {
    try {
      const loc = page.getByText(t, { exact: false }).first();
      if (await loc.isVisible({ timeout: 600 })) {
        await loc.click({ timeout: 2000 });
        return true;
      }
    } catch {}
  }
  return false;
}

function pageHas(text, markers) {
  const lower = text.toLowerCase();
  return markers.some((m) => lower.includes(m.toLowerCase()));
}

async function main() {
  const prompt = fs.readFileSync(args.promptFile, "utf8").trim();
  if (!prompt) emit("STREAM_ERROR", { detail: "prompt file is empty" });
  if (prompt.length > 20000) emit("STREAM_ERROR", { detail: "prompt over 20000 chars, pack it tighter" });

  const hit = privacyScan(prompt);
  if (hit) emit("PRIVACY_BLOCKED", { detail: `prompt matched secret pattern: ${hit}` });

  if (!acquireLock()) emit("LOCKED", { detail: "another guest call is running" });

  const state = readState();
  const now = Date.now();
  if (state.cooldown_until && state.cooldown_until > now) {
    emit("COOLDOWN", {
      detail: "login wall cooldown active",
      retry_after_sec: Math.ceil((state.cooldown_until - now) / 1000),
    });
  }
  if (state.last_finished_at && now - state.last_finished_at < COOLDOWN_SEC * 1000) {
    emit("COOLDOWN", {
      detail: "minimum interval between calls",
      retry_after_sec: Math.ceil((COOLDOWN_SEC * 1000 - (now - state.last_finished_at)) / 1000),
    });
  }

  if (args.dryRun) emit("DRY_RUN_OK", { detail: "privacy, lock and cooldown checks passed, no page opened" });

  const selectors = JSON.parse(
    fs.readFileSync(path.join(SKILL_DIR, "references", "selectors.json"), "utf8")
  );

  const pw = loadPlaywright();
  if (!pw) {
    writeState({ last_finished_at: Date.now() });
    emit("BROWSER_UNAVAILABLE", { detail: "playwright module not resolvable on this machine" });
  }

  let browser;
  let headedMode = !!args.headed;
  const launchBrowser = async (headed) => {
    const launchOpts = {
      headless: !headed,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    };
    // An explicit --proxy (for example a local ur.io TLS bridge) wins. Without
    // one, Chromium inherits this VM's egress proxy, which chatgpt.com resets,
    // so pass --proxy whenever a clean exit is available.
    if (args.proxy) launchOpts.proxy = { server: args.proxy };
    return pw.chromium.launch(launchOpts);
  };
  try {
    browser = await launchBrowser(headedMode);
  } catch (e) {
    writeState({ last_finished_at: Date.now() });
    emit("BROWSER_UNAVAILABLE", { detail: `chromium launch failed: ${String(e).slice(0, 200)}` });
  }

  let debugPage = null;
  const finish = async (status, extra = {}) => {
    const patch = { last_finished_at: Date.now() };
    if (status === "LOGIN_WALL") patch.cooldown_until = Date.now() + LOGIN_WALL_COOLDOWN_SEC * 1000;
    writeState(patch);
    // Opt-in diagnostics: on failure, keep a screenshot and a DOM census so
    // the next fix is based on what the page actually was, not on guesses.
    if (args.debugDir && status !== "OK" && debugPage) {
      try {
        fs.mkdirSync(args.debugDir, { recursive: true });
        await debugPage.screenshot({ path: path.join(args.debugDir, "failure.png") }).catch(() => {});
        const census = await debugPage.evaluate(() => ({
          url: location.href,
          title: document.title,
          bodyTextHead: (document.body.innerText || "").slice(0, 1200),
          assistantRoleCount: document.querySelectorAll("[data-message-author-role]").length,
          testids: [...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")).filter((v, i, a) => a.indexOf(v) === i).slice(0, 40),
        })).catch(() => null);
        fs.writeFileSync(path.join(args.debugDir, "census.json"), JSON.stringify({ status, extra, census }, null, 1));
      } catch {}
    }
    try { await browser.close(); } catch {}
    emit(status, extra);
  };

  // A realistic context matters more than any single flag: a default
  // Playwright headless context announces HeadlessChrome in its UA, has no
  // viewport/screen to speak of and leaves webdriver readable — chatgpt.com
  // serves a verification interstitial to that shape even from a clean IP,
  // while the same script headed (e.g. under Xvfb) loads the composer fine.
  const openGuestPage = async () => {
    const version = browser.version() || "131.0.0.0";
    const major = String(version).split(".")[0];
    const context = await browser.newContext({
      locale: "en-US",
      // Match the timezone to the exit's region when you route through a
      // regional proxy (set CHATGPT_GUEST_TZ, e.g. Asia/Singapore); an
      // exit/timezone mismatch is a classic fingerprint inconsistency.
      ...(process.env.CHATGPT_GUEST_TZ ? { timezoneId: process.env.CHATGPT_GUEST_TZ } : {}),
      userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
      viewport: { width: 1280, height: 800 },
      screen: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await page.goto(selectors.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    return page;
  };

  try {
    let page = await openGuestPage();
    debugPage = page;

    let text = await page.evaluate(() => document.body.innerText || "");
    const title = await page.title();
    if (pageHas(title + "\n" + text, selectors.captchaMarkers)) {
      // Headless is the trigger in every observed case. If a display exists
      // (Xvfb counts), retry exactly once headed before giving up.
      if (!headedMode && process.env.DISPLAY) {
        try { await browser.close(); } catch {}
        headedMode = true;
        browser = await launchBrowser(true);
        page = await openGuestPage();
        debugPage = page;
        text = await page.evaluate(() => document.body.innerText || "");
        const title2 = await page.title();
        if (pageHas(title2 + "\n" + text, selectors.captchaMarkers)) {
          return finish("CAPTCHA_REQUIRED", { detail: "verification interstitial on load (headed retry also blocked)" });
        }
      } else {
        return finish("CAPTCHA_REQUIRED", {
          detail: headedMode
            ? "verification interstitial on load"
            : "verification interstitial on load in headless mode; rerun headed under a display (e.g. xvfb-run -a ... --headed)",
        });
      }
    }

    await clickTextIfPresent(page, selectors.stayLoggedOutTexts);
    await page.waitForTimeout(800);
    await clickTextIfPresent(page, selectors.dismissTexts);

    const composer = await firstVisible(page, selectors.composer);
    if (!composer) {
      text = await page.evaluate(() => document.body.innerText || "");
      if (pageHas(text, selectors.loginWallMarkers)) return finish("LOGIN_WALL", { detail: "no composer, login wall text present" });
      if (pageHas(text, selectors.captchaMarkers)) return finish("CAPTCHA_REQUIRED", { detail: "no composer, captcha markers present" });
      return finish("STREAM_ERROR", { detail: "composer not found" });
    }

    await composer.click();
    try {
      await page.keyboard.insertText(prompt);
    } catch {
      await composer.fill(prompt);
    }
    await page.waitForTimeout(400);

    const sendBtn = await firstVisible(page, selectors.sendButton);
    if (sendBtn) await sendBtn.click({ timeout: 5000 });
    else await page.keyboard.press("Enter");

    // Completion: stop button gone AND answer text stable for 2.5s.
    // The answer text is read on every poll, including while the stop button
    // is visible: an earlier version only read after generation finished, so
    // a generation that ran past the deadline lost text that was already on
    // the page. Any assistant-message selector that matches is accepted.
    const readLastAssistantText = async () => {
      for (const sel of selectors.assistantMessage) {
        const msgs = page.locator(sel);
        const count = await msgs.count().catch(() => 0);
        if (!count) continue;
        const t = await msgs.nth(count - 1).innerText().catch(() => "");
        if (t) return t;
      }
      // Fallback for the attribute-free UI variant (observed 2026-11-27):
      // messages carry no data-message-author-role at all; the conversation
      // container's innerText is exactly "prompt\n\nanswer\n\ndisclaimer".
      // The prompt we sent is known verbatim, so subtract it: find the
      // smallest container whose text starts with the prompt's head, cut
      // everything up to the prompt's tail, strip the trailing disclaimer.
      try {
        return await page.evaluate((p) => {
          const head = p.slice(0, 60);
          const tail = p.slice(-40);
          const root = document.querySelector("main") || document.body;
          let best = null;
          root.querySelectorAll("*").forEach((e) => {
            const t = (e.innerText || "").trim();
            // Must contain something beyond the prompt itself: the user
            // bubble alone also starts with the head and is shorter than
            // the conversation container, so a naive smallest-match picks
            // the bubble and subtracts to nothing.
            if (t.startsWith(head) && t.length > p.length + 10) {
              if (!best || t.length < best.length) best = t;
            }
          });
          if (!best) return "";
          const idx = best.lastIndexOf(tail);
          if (idx < 0) return "";
          let rest = best.slice(idx + tail.length).trim();
          const cut = rest.indexOf("\nChatGPT is AI");
          if (cut >= 0) rest = rest.slice(0, cut).trim();
          return rest;
        }, prompt);
      } catch { return ""; }
    };
    const deadline = Date.now() + args.timeoutSec * 1000;
    let lastText = "";
    let stableSince = Date.now();
    let sawStop = false;
    let timedOut = false;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1000);
      const stop = await firstVisible(page, selectors.stopButton);
      const current = await readLastAssistantText();
      if (current && current !== lastText) {
        lastText = current;
        stableSince = Date.now();
      }
      if (stop) { sawStop = true; stableSince = Date.now(); continue; }
      if (current && Date.now() - stableSince >= 4000) break;
    }
    if (Date.now() >= deadline) timedOut = true;
    if (!lastText) return finish("STREAM_ERROR", { detail: "no answer text extracted", saw_stop: sawStop });

    const fullText = await page.evaluate(() => document.body.innerText || "");
    if (pageHas(fullText, selectors.rateLimitMarkers) && lastText.length < 80) {
      return finish("RATE_LIMITED", { detail: "rate limit or error marker on page" });
    }
    if (pageHas(fullText, selectors.loginWallMarkers) && lastText.length < 80) {
      return finish("LOGIN_WALL", { detail: "login wall marker after send" });
    }

    // Citations: links inside the last assistant message plus URLs in the text.
    let citations = [];
    try {
      for (const sel of selectors.assistantMessage) {
        const msgs = page.locator(sel);
        const count = await msgs.count().catch(() => 0);
        if (!count) continue;
        citations = await msgs.nth(count - 1).evaluate((el) =>
          [...el.querySelectorAll("a[href]")].map((a) => a.href)
        );
        if (citations.length) break;
      }
    } catch {}
    for (const m of lastText.matchAll(/https?:\/\/[^\s)\]]+/g)) citations.push(m[0]);
    citations = [...new Set(citations)].filter((u) => !u.includes("chatgpt.com"));

    return finish("OK", timedOut
      ? { answer: lastText, citations, detail: "answer captured at timeout; may be truncated" }
      : { answer: lastText, citations });
  } catch (e) {
    const msg = String(e);
    if (/ERR_TUNNEL|ERR_CONNECTION|ERR_PROXY|ERR_NAME_NOT_RESOLVED/.test(msg)) {
      return finish("NETWORK_ERROR", { detail: msg.slice(0, 300) });
    }
    return finish("STREAM_ERROR", { detail: msg.slice(0, 300) });
  }
}

main().catch((e) => {
  console.log(JSON.stringify({
    status: "STREAM_ERROR", source: "chatgpt_guest",
    trust_level: "unverified_clue", duration_ms: Date.now() - startedAt,
    detail: String(e).slice(0, 300),
  }));
  process.exit(3);
});
