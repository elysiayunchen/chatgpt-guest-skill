# chatgpt-guest — a Muse skill for collaborating with the logged-out ChatGPT

Use the free, logged-out web ChatGPT as a **second opinion and cited web scout** for your main agent. It receives only what you deliberately pack into a single prompt, it keeps no account and no history, and its answers never have to be trusted — the contract below obliges the main agent to verify them.

Built for [Muse](https://muse.ai) custom skills. Design input came from a Gemini review of the architecture (brain/hand separation), and every claim below was tested before it was written down.

## Why this exists

A guest ChatGPT session has three real advantages:

- **Heterogeneous perspective.** A different model family catches blind spots your main model shares with itself.
- **ChatGPT Search with sources.** Guest mode can do a cited first pass over public web information.
- **No memory of its own.** No account, and no conversation history carried between sessions; every call starts from a clean guest session. (This is a statement about conversational context, not about the provider's server-side retention, which no client can audit.)
- **Guest by design, not by compromise.** A logged-in account used from a cloud browser sits behind exit IPs that keep changing, and repeated logins from shifting IPs are exactly what account risk controls punish. A guest session needs no login at all, so it stays flexible and disposable: one call, one clean session, nothing to protect and nothing to lose. What it returns is a heterogeneous perspective from a different model family — and the trust contract below grades it as a second opinion, never as gospel.

And four hard limits:

- The guest model is lightweight and can silently degrade under load.
- No file or image uploads, no image generation, no deep research, no multi-round memory.
- Guest mode is sensitive to datacenter IPs and automation fingerprints. Login walls and CAPTCHAs are a matter of time, not bad luck.
- Nothing sent can be recalled. Whatever you type into a guest session is gone from your control.

This skill encodes all of that as routing rules, a packing protocol, a deterministic runner, and a status-code state machine, so the agent uses the guest where it is strong and never where it is weak.

## Architecture

Four layers, kept separate on purpose:

1. **Strategy routing** (`SKILL.md`): a whitelist and blacklist. Guest calls are for public web first passes, blind spot checks, alternative explanations and light polishing of public text. They are refused for private material, complex reasoning, code engineering, multi-round work and batch runs.
2. **Interaction protocol**: one self-contained single-shot prompt per call, explicit web intent (search with URLs, or no search), and a trust contract — every answer comes back labelled `source: chatgpt_guest`, `trust_level: unverified_clue`, and any fact that matters must be verified against its cited original source before use.
3. **Deterministic runner** (`scripts/ask_guest.mjs`): a Playwright driver that returns exactly one JSON object. Semantic selectors only, all of them externalised in `references/selectors.json`, so a DOM change is a data fix, not a code rewrite. Completion is detected by stop-button disappearance plus a 2.5 second text-silence window, never a fixed sleep.
4. **Guardrails**: a strict serial file lock, a 20 second minimum interval between calls, a 30 minute cooldown after a login wall, and a privacy pre-scan that refuses prompts containing secret-shaped material (API keys, tokens, private key blocks, password assignments) before any page is opened.

## Status codes

`OK`, `LOGIN_WALL`, `CAPTCHA_REQUIRED`, `RATE_LIMITED`, `STREAM_ERROR`, `NETWORK_ERROR`, `COOLDOWN`, `LOCKED`, `PRIVACY_BLOCKED`, `BROWSER_UNAVAILABLE`, `DRY_RUN_OK`.

Each code maps to one defined fallback in `references/status-codes.md`. The agent never retries blindly and never loops against a CAPTCHA.

## Install

1. Copy this folder into your Muse custom-skills directory (for example `~/workspace/custom-skills/chatgpt-guest/`) so `SKILL.md` and `skill.yaml` are discovered as the `chatgpt_guest` skill.
2. The **script route** needs Node.js 18+ and Playwright with its Chromium build:

   ```bash
   npm i playwright            # or set PLAYWRIGHT_MODULE_PATH to an existing install
   npx playwright install chromium
   ```

3. The **browser route** needs no local dependencies: the agent opens chatgpt.com with its own browser capability and works as a guest. No selectors are involved on this route — the agent applies the same status vocabulary (`LOGIN_WALL`, `CAPTCHA_REQUIRED`, …) by observation. If your agent has no browser, the script route is the only route.

## Usage

```bash
# validate a prompt without opening any page
node scripts/ask_guest.mjs --prompt-file prompt.txt --dry-run

# one real guest call (strictly serial, cooldown enforced)
# On a headless Linux server, run it headed under a virtual display —
# plain headless Chromium is served a verification interstitial on load.
xvfb-run -a node scripts/ask_guest.mjs --prompt-file prompt.txt --headed

# route through a clean exit, and match the context timezone to its region
CHATGPT_GUEST_TZ=Asia/Singapore xvfb-run -a node scripts/ask_guest.mjs \
  --prompt-file prompt.txt --headed --proxy http://127.0.0.1:7890

# on failure, keep a screenshot + DOM census for diagnosis
node scripts/ask_guest.mjs --prompt-file prompt.txt --headed --debug-dir /tmp/guest-debug
```

Prompt templates for the four sanctioned call types live in `references/prompt-templates.md`.

## Honest verification status (2026-11-27)

Two different kinds of evidence, kept separate on purpose:

- **Local guardrail tests (deterministic):** 5 of 5 passed — dry run, privacy block, serial lock, interval cooldown, login-wall cooldown. These prove the control logic, not the live integration. Details in `references/verification-2026-11-27.md`.
- **Live integration evidence:** the browser route has completed real guest sessions end to end, including a blind-spot review of this repository's own documentation. The script route is now also verified end to end — but only in its working shape, found by live diagnosis on 2026-11-27: **headed under a virtual display** (`xvfb-run -a node scripts/ask_guest.mjs --headed --proxy <clean-exit>`), with the context timezone matched to the exit region (`CHATGPT_GUEST_TZ`). In that shape it completes real one-shot questions in ~15–60 s. What does not work, also verified: plain headless Chromium is served a human-verification interstitial on load even from a clean exit, and datacenter egress fails earlier at the network layer (`NETWORK_ERROR`). A second, attribute-free UI variant is handled by an echo-subtraction extraction fallback. Full diagnosis in `references/verification-2026-11-27.md`.

**Guaranteed vs heuristic.** Guaranteed by the code: the serial lock, the 20 s interval, the login-wall cooldown, the privacy pre-scan, and the single-JSON output shape — for example a dry run returns exactly:

```json
{"status":"DRY_RUN_OK","route":"script","model":null,"answer":null,"citations":[],"session_url":null,"error":"Dry run: prompt passed the privacy pre-scan and would be sent as-is.","meta":{"skill":"chatgpt_guest","version":"0.1.0","duration_ms":3,"prompt_chars":128}}
```

Heuristic by nature: selector matching against a changing page, completion detection, guest availability from any given network, and citation quality. The status codes exist precisely so those heuristics fail loudly instead of silently.

## Scope and terms note

Automating a web UI sits in a grey area of most services' terms. This skill is deliberately shaped as a low-frequency personal assistant tool: serial calls, human-paced intervals, hard cooldowns, no batch scraping, no account sharing or resale. If that does not match your situation, do not use the runner.

## Layout

```
SKILL.md                        strategy, protocol, fallback rules
skill.yaml                      Muse skill descriptor
scripts/ask_guest.mjs           deterministic one-shot runner
references/selectors.json       every page selector, externalised
references/prompt-templates.md  the four sanctioned prompt shapes
references/status-codes.md      the state machine and fallbacks
references/verification-*.md   what was actually tested, and what failed
```

## License

MIT
