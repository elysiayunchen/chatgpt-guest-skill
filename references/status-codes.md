# Status codes and fallback behaviour

The runner prints exactly one JSON object. Muse acts on `status` and never retries blindly.

| Status | Meaning | Muse's next move |
|---|---|---|
| `OK` | Answer extracted, with citations list and duration | Verify cited facts against the original URLs, then use as an unverified second opinion only |
| `LOGIN_WALL` | Guest session hit a forced login or usage limit | Runner sets a 30 minute cooldown marker. Fall back to browser.search, Parallel MCP, or Muse's own reasoning |
| `CAPTCHA_REQUIRED` | Cloudflare or human verification appeared | Never loop. Live session: offer the user the live browser. Unattended: stop the guest route for this task |
| `RATE_LIMITED` | Too many requests, or a generic something-went-wrong wall after sending | Stop the guest route for this task. Continue with another source |
| `STREAM_ERROR` | Answer never settled inside the timeout, or extraction failed | One later retry is allowed after the cooldown. Otherwise fall back |
| `NETWORK_ERROR` | The page itself never loaded (tunnel failure, connection reset, proxy refusal) | Do not retry on the same exit. Switch exit (for example `--proxy` with a clean residential bridge) or use the browser route |
| `COOLDOWN` | A previous call is too recent, or a login wall cooldown is active | Wait `retry_after_sec`, or pick another route. Never spin |
| `LOCKED` | Another guest call is already running | Wait for it or pick another route. Calls are strictly serial |
| `PRIVACY_BLOCKED` | Prompt matched a secret-shaped pattern (API key, token, private key block, password assignment) | Rewrite without the flagged material or drop the guest call. Never override |
| `BROWSER_UNAVAILABLE` | Playwright or its Chromium is not reachable on this machine | Use the browser.browse route on chatgpt.com instead |
| `DRY_RUN_OK` | Validation only: prompt passed privacy scan, lock and cooldown checks passed | The prompt is packable. No page was opened |

## Trust contract

- `source` is always `chatgpt_guest`.
- `trust_level` is always `unverified_clue`.
- A guest answer can support a hypothesis or supply leads. It can never be the sole evidence for a fact in a deliverable.
