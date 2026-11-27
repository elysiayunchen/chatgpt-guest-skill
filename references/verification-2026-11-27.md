# Verification record, 2026-11-27 (Asia/Tokyo)

## Local deterministic tests, all passed

Run against `scripts/ask_guest.mjs` with an isolated `--state-dir`:

1. `--dry-run` on a clean public prompt returned `DRY_RUN_OK`, exit 0.
2. A prompt containing an `sk-` shaped string returned `PRIVACY_BLOCKED` naming only the pattern class, exit 3.
3. A pre-planted fresh lock file returned `LOCKED`, exit 3.
4. A `last_finished_at` inside the cooldown window returned `COOLDOWN` with `retry_after_sec: 20`, exit 3.
5. A `cooldown_until` marker 30 minutes out returned `COOLDOWN` with `retry_after_sec: 1800`, exit 3.

## Live script route on the Muse VM: blocked at the network layer

- Default egress proxy: `page.goto` failed with `ERR_TUNNEL_CONNECTION_FAILED`, now classified as `NETWORK_ERROR`.
- Proxy variables cleared plus `--no-proxy-server`: `ERR_CONNECTION_RESET`.
- Airport exit through the local mihomo proxy: HTTP 403 from chatgpt.com.
- Conclusion: the VM's datacenter exits cannot carry the script route. It needs a clean exit passed with `--proxy` (for example a residential TLS bridge) or a machine whose browser already has a working route to chatgpt.com. The runner reports this honestly instead of retrying.

## Live browser route: passed

- 2026-11-27 03:57 to 03:58 JST, cloud browser, guest session on chatgpt.com.
- No login wall, no CAPTCHA, no error. The page showed login and sign-up buttons but did not block guest use, and no credentials were entered.
- The packed test prompt (alternative explanation of a hash function, no web search, 120 word cap) was sent as one round and the full answer came back within about a minute, inside the word cap, with the analogy and its breakdown point as requested.
- The page did not display which model answered, so the guest model identity stays unconfirmed, exactly as the skill's downgrade rule assumes.
- Session link: https://chatgpt.com/uc/6b08813f-1ed4-83ea-bfc7-311e9414369b
