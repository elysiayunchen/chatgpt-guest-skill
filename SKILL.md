# ChatGPT Guest Collaboration

## When to use

- Use this skill when a task gains real value from a heterogeneous second opinion or from a cited first pass over public web information, and the logged-out web ChatGPT can supply it in one self-contained round.

- Treat the guest ChatGPT as a scout and a sparring partner, never as the main model and never as a source of record.

- Keep the division of labour strict, with Muse doing the routing decision, the prompt packing and the verification, and the browser or script layer doing only the mechanical page work.

## Route the call before making it

- Call the guest for a public event first pass where it must search the web and return original source URLs.

- Call the guest for a blind spot check on a draft or a plan, asking it for counterexamples, missing risks and an alternative framing.

- Call the guest for a plain language re-explanation of a public concept from a different angle when Muse's own explanation has stalled.

- Call the guest for light polishing of public or fully de-identified text.

- Refuse the call when the task needs a specific page fetched in full or a strict structured extraction, and use `browser.open`, `browser.search` or a connector instead.

- Refuse the call when the task needs complex multi-step reasoning, long context analysis, rigorous mathematics or production code engineering.

- Refuse the call when the work depends on follow-up rounds, file or image uploads, image generation, deep research or cross-session memory, because guest mode supports none of them.

- Refuse the call when a batch would need parallel or high-frequency runs, because guest mode degrades silently and rate limits fast.

## Hold the privacy red line

- Send only 100 percent public information or material that has been fully de-identified before packing.

- Never send the user's private records, local code, API keys, tokens, unpublished documents, names paired with identifying detail, or anything copied from memory files.

- Stop and ask the user when a useful prompt would need material that sits near that line, and show the exact text that would be sent.

- Remember that a guest session has no account memory, so nothing sent can be recalled or deleted later.

## Pack one self-contained prompt

- Write one single-shot prompt that carries the full context, the task, the constraints and the exact output format, because the session is discarded after one round.

- State the web intent explicitly, either requiring a web search with original URLs listed, or forbidding search for opinion and polishing tasks.

- Cap the requested length in the prompt and ask for claims to be separated from opinions.

- Use the templates in [references/prompt-templates.md](references/prompt-templates.md) instead of improvising a new shape each time.

- Save the packed prompt to a file under `/tmp` and pass that file to the runner, so the exact sent text stays auditable for the turn.

## Execute through one of two routes

- Prefer the script route for a plain one-shot question by running `node ~/workspace/custom-skills/chatgpt-guest/scripts/ask_guest.mjs --prompt-file <file>` and reading its single JSON result.

- Use the browser route with `browser.browse` on chatgpt.com when the script route returns `BROWSER_UNAVAILABLE` or `CAPTCHA_REQUIRED` during a live session with the user present.

- Run calls strictly one at a time and respect the cooldown the runner reports, never opening parallel guest tabs to speed a task up.

- Expect the guest model to be a lightweight model that can silently degrade further under load, and weigh its answer accordingly.

## Downgrade and verify every result

- Treat every guest answer as metadata wrapped output with source chatgpt_guest and trust level unverified_clue.

- Verify any fact that matters against the cited original URLs with `browser.open` or `browser.search` before using it in a deliverable.

- Report disagreements between the guest answer and verified sources plainly, and keep the verified source as the one that stands.

- Label guest-derived material as a ChatGPT guest second opinion when presenting it to the user, and never present it as Muse's own checked conclusion.

- Drop guest output entirely when it arrives without citations for a task that required them.

## React to status codes

- Act on `OK` by moving to the verification step above.

- Act on `LOGIN_WALL` by waiting out the cooldown the runner sets, then falling back to `browser.search`, the Parallel connector or Muse's own reasoning.

- Act on `CAPTCHA_REQUIRED` by stopping at once during unattended work, or by offering the user the live browser to clear it during a live session.

- Act on `RATE_LIMITED` and `STREAM_ERROR` by stopping the guest route for the task and continuing with another source.

- Act on `NETWORK_ERROR` by changing the exit or the route, never by retrying the same path, and pass a clean exit to the runner with `--proxy` when one is available.

- Act on `COOLDOWN` by waiting the reported seconds or choosing another route, never by retrying in a loop.

- Act on `PRIVACY_BLOCKED` by rewriting the prompt without the flagged material or dropping the guest call.

- Read the full state machine in [references/status-codes.md](references/status-codes.md) when a status is unfamiliar.

## Available connectors

- [Parallel MCP](~/workspace/custom-connectors/custom.parallel/CONNECTOR.md) for cited web research that replaces the guest route when it is down or blocked.

- Use `muse.connector_search` to find other connectors and `muse.skill_search` to find related skills.

- If nothing here fits, look on the web for a maintained API or MCP server and set it up with [Custom Connectors and MCPs](/opt/muse/skills/custom-connector-setup/SKILL.md), or build a custom connector.

## Websites

- [ChatGPT](https://chatgpt.com/) for the logged-out guest session itself. Carry in only the packed single-shot prompt file content and carry out the answer text plus every cited URL for verification.
