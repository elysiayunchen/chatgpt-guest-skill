# Prompt templates for the ChatGPT guest route

Every template is single-shot and self-contained. Replace the bracketed parts, keep the structure, and never paste private material into any of them.

## 1. Cited web first pass

```
Use web search for this. Topic: [public topic and time window].

Return exactly:
1. A summary of at most 150 words.
2. A list of the key claims, each followed by the original source URL it came from.
3. A separate list of anything you could not verify.

Separate facts from opinions. Do not invent dates, numbers or quotes.
```

## 2. Blind spot check (second opinion)

```
Do not use web search. Below is a draft or plan written by someone else.
Your job is only to attack it constructively.

Return exactly:
1. The three weakest assumptions, and why each is weak.
2. Two concrete counterexamples or failure cases.
3. One alternative framing the author has not considered.
4. What evidence would change your assessment.

Be specific. Do not rewrite the draft and do not praise it.

---
[PASTE PUBLIC OR DE-IDENTIFIED DRAFT HERE]
---
```

## 3. Alternative explanation

```
Do not use web search. Explain [public concept] to a smart beginner in a
completely different way from the standard textbook explanation.

Use one everyday analogy, then state where the analogy breaks down.
At most 250 words. Plain language, no jargon without a gloss.
```

## 4. Light polish of public text

```
Do not use web search. Polish the text between the markers for clarity and
rhythm only. Keep every fact, number and name exactly as written.
Return only the polished text, nothing else.

---
[PUBLIC TEXT]
---
```

## Packing rules

- One prompt, one round. Never plan a follow-up question inside the same call.
- State the web intent in the first line, either requiring search with URLs or forbidding it.
- Cap the output length in the prompt itself.
- If the answer will feed a deliverable, require citations and plan to verify every one of them afterwards.
