# chatgpt-guest — a Muse skill for collaborating with the logged-out ChatGPT

Use the free, logged-out web ChatGPT as a **second opinion and cited web scout** for your main agent, without giving it your data, your accounts, or your trust.

Built for [Muse](https://muse.ai) custom skills. Design input came from a Gemini review of the architecture (brain/hand separation), and every claim below was tested before it was written down.

## Why this exists

A guest ChatGPT session has three real advantages:

- **Heterogeneous perspective.** A different model family catches blind spots your main model shares with itself.
- **ChatGPT Search with sources.** Guest mode can do a cited first pass over public web information.
- **Zero memory pollution.** No account, no history. Every session starts clean and is discarded.

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

## Usage

```bash
# validate a prompt without opening any page
node scripts/ask_guest.mjs --prompt-file prompt.txt --dry-run

# one real guest call (strictly serial, cooldown enforced)
node scripts/ask_guest.mjs --prompt-file prompt.txt --timeout 120

# route through a clean exit, e.g. a local residential bridge
node scripts/ask_guest.mjs --prompt-file prompt.txt --proxy http://127.0.0.1:8888
```

Prompt templates for the four sanctioned call types live in `references/prompt-templates.md`.

## Honest verification status (2026-11-27)

- Local deterministic tests: 5 of 5 passed (dry run, privacy block, serial lock, interval cooldown, login-wall cooldown). Details in `references/verification-2026-11-27.md`.
- Script route from a datacenter VM: **blocked at the network layer**. The default egress tunnel fails, a cleared-proxy attempt is connection-reset, and an airport exit gets HTTP 403 from chatgpt.com. The runner reports this as `NETWORK_ERROR` instead of retrying. It needs a clean exit via `--proxy`, or a machine whose browser already reaches chatgpt.com.
- Browser route: **passed end to end**. A guest session completed a packed single-shot prompt in about a minute with no login wall and no CAPTCHA. The page did not disclose which model answered, which is exactly why the trust contract downgrades every answer.

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
