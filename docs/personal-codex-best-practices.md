# Personal Codex Best Practices

Last updated: 2026-03-23

This document is a practical playbook for individual Codex use. It is written for day-to-day coding and front-end work, not for abstract "AI usage principles". The recommendations below are anchored to current OpenAI guidance around Codex, GPT-5.4, Responses API, reasoning, evals, and the recent GPT-5.4 frontend article.

## 1. Default operating mode

### 1.1 Use GPT-5.4 as the default starting point

- For most coding tasks, start with `gpt-5.4`.
- Do not default to a Codex-branded model just because the task is code-related.
- Escalate to a stronger reasoning setup only when the task is structurally hard:
  - cross-file refactors,
  - architecture-level debugging,
  - migration planning,
  - long-running tool workflows,
  - ambiguous failures with multiple candidate root causes.

Why:

- OpenAI currently recommends the general-purpose GPT-5 family, especially `gpt-5.4`, for most code generation tasks in Codex.
- OpenAI also positions GPT-5.4 as the main migration target and recommends tuning reasoning level instead of assuming one fixed setting is always correct.

## 2. Prefer Responses-style workflows over stateless chat habits

### 2.1 Treat multi-step work as a stateful workflow

- For tasks that span inspection, edits, tests, and follow-up fixes, think in terms of a persistent workflow rather than isolated prompts.
- Keep prior outputs and tool context available when continuing a task.
- If you are designing a custom OpenAI integration outside Codex, prefer the `Responses API` for stateful and tool-using workflows.

### 2.2 Long jobs should be treated as background work

- If the task can take minutes, expect retries, or requires many tool calls, treat it as a background job.
- Do not design your flow around single blocking requests with fragile timeouts.
- For heavy reasoning variants such as `gpt-5.4-pro`, assume background execution is the safe path.

Why:

- OpenAI explicitly recommends `Responses API` for GPT-5 workflows and notes better intelligence, fewer reasoning tokens, better cache hit rates, and lower latency in that model/API pairing.
- OpenAI also explicitly recommends `background mode` for long-running requests and hard problems.

## 3. Prompt for execution, not for explanation

### 3.1 A good Codex task request has four parts

Use this structure:

```text
Goal:
What must be true when the task is done.

Scope:
Which files/surfaces may change, and what must stay untouched.

Constraints:
Technology, style, risk, and non-goals.

Verification:
What Codex must run or check before finishing.
```

Example:

```text
Goal:
Make the Excel table preview handle multi-table sheets correctly.

Scope:
Only touch server/lib/excel.ts and tests related to parsing.

Constraints:
Do not change API response shape. Preserve current generator-based parsing model.

Verification:
Run npm run check and the parser-related test path. Report any unverified edge cases.
```

### 3.2 Ask for a closed loop

Prefer wording like:

- inspect first, then edit;
- make the smallest coherent change;
- run checks after editing;
- if a check fails, fix the obvious follow-up if it is local to the task;
- finish with change summary, verification, and remaining risks.

This reliably produces better Codex behavior than asking for "a solution" or "an idea".

## 4. Do not over-prompt reasoning models

### 4.1 Stop writing old-style chain-of-thought bait

Avoid stuffing prompts with:

- "think step by step",
- "think harder",
- giant procedural monologues,
- vague mandates like "be extremely careful" repeated many times.

Use instead:

- explicit constraints,
- clean inputs,
- clear output format,
- concrete acceptance checks.

### 4.2 For hard tasks, increase reasoning only after the task framing is clean

- First improve the task statement.
- Then raise reasoning level if the task is still underperforming.
- Do not use higher reasoning to compensate for a muddy prompt.

Why:

- OpenAI's reasoning guidance favors direct instructions and structured inputs over theatrical prompting.
- GPT-5.4 migration guidance also recommends experimenting with reasoning levels rather than assuming one universal default.

## 5. Frontend work: prompt the visual system, not just the DOM

This is the part most people miss.

### 5.1 Never start frontend work with "make it nicer"

That produces median UI.

Instead, specify all four:

- visual direction,
- product intent,
- density level,
- forbidden aesthetics.

Example:

```text
Visual direction:
Operational desktop tool, not marketing page.

Product intent:
Fast scanning, low visual noise, high data density.

Density:
Compact. Prioritize table legibility and rapid repeated use.

Avoid:
Generic SaaS gradients, oversized cards, decorative empty space, playful animation.
```

### 5.2 Force exploration before convergence

For net-new UI, ask Codex to:

1. propose 2 to 3 distinct directions,
2. name the tradeoff of each direction,
3. then implement only the selected direction.

This matches the OpenAI GPT-5.4 frontend article much better than "build the page" in one shot.

### 5.3 Make the model work at the right layer

When you want design quality, specify:

- typography mood,
- spacing behavior,
- component density,
- state styling,
- responsive behavior,
- interaction style.

Example:

```text
Typography:
Functional and restrained. No default SaaS look.

Spacing:
Tight but readable. Prefer 8/12/16 rhythm.

States:
Hover and focus must improve usability, not just add motion.

Responsive:
Desktop first, then compact adaptation below the defined breakpoint.
```

### 5.4 Use generated images or moodboards only as a divergence tool

- Use them to explore direction early.
- Do not treat them as production-ready specs.
- Once a direction is chosen, convert back into explicit UI constraints and implementation requirements.

Why:

- OpenAI's GPT-5.4 frontend article recommends exploring multiple directions and giving the model richer style/context guidance before converging on implementation.

## 6. Require visible progress in tool-heavy tasks

For tasks involving file reads, edits, tests, browser steps, or multiple passes:

- require short progress updates;
- require the agent to explain what it is doing before large edits;
- require a final report that separates:
  - changed,
  - verified,
  - unverified,
  - remaining risk.

This is not cosmetic. In practice it reduces silent drift and helps catch wrong assumptions earlier.

## 7. Validation is part of the task, not an optional extra

### 7.1 Every meaningful Codex request should include at least one verification clause

Examples:

- run `npm run check`;
- run the affected test file;
- smoke-test the changed page;
- verify no console errors on the flow;
- confirm mobile and desktop layouts;
- report what could not be validated.

### 7.2 Evaluate changes continuously, not only at the end

- If you change the prompt, workflow, or model setup, re-run checks.
- If the task is prompt-sensitive, save examples that passed and failed.
- Grow a small personal eval set for repeated workflows.

Why:

- OpenAI's evaluation guidance explicitly recommends continuous evaluation on every change and emphasizes representative data, edge cases, and adversarial cases.

## 8. Build a personal anti-regression set

For recurring Codex tasks, keep a short set of reusable test prompts:

- one normal case,
- one edge case,
- one failure case,
- one ambiguity case.

Examples for a coding workflow:

- normal: implement a small UI change in one component;
- edge: refactor a utility used in several files;
- failure: fix a flaky test without changing behavior;
- ambiguity: debug a bug with two likely causes.

If a new model or prompt style performs worse on any of these, do not roll it into your default workflow yet.

## 9. Personal model-selection heuristics

Use this as a working default:

- `gpt-5.4`
  - default for most coding, refactoring, review, and front-end implementation;
- `gpt-5.4` with higher reasoning
  - use when the task is hard but still bounded;
- `gpt-5.4-pro`
  - reserve for expensive, high-stakes, structurally difficult work where delay is acceptable;
- lighter/faster models
  - use for bulk transformations, scaffolding, low-risk formatting, or repeated narrow tasks after the workflow is already proven.

Important:

- Change one variable at a time.
- Do not simultaneously switch model, prompt style, and workflow structure if you want to know what improved.

## 10. Personal front-end prompt template

Use this when you want Codex to build or restyle UI without falling into generic output:

```text
Goal:
Implement/refine [page or component].

Product intent:
What this screen is for and how people use it.

Visual direction:
Describe the design language in plain language.

Density:
Compact / balanced / spacious.

Constraints:
Keep existing design system / may redesign visually / do not change IA / do not add libraries.

Avoid:
List the UI failure modes you do not want.

Implementation:
Which files can change.

Verification:
Typecheck/build/smoke test/responsive checks/console errors.
```

## 11. Personal coding task template

```text
Goal:
[concrete end state]

Scope:
[allowed files or modules]

Must preserve:
[APIs, schema, behavior, visual language]

Do not:
[non-goals]

Execution:
Inspect current implementation first, then make the smallest coherent fix.

Verification:
Run [checks]. If something cannot be verified, say so explicitly.

Output:
Summarize changes, verification, and remaining risks.
```

## 12. Anti-patterns

Avoid these habits:

- asking for "best practice" without a concrete operating context;
- asking for "make it better" without constraints;
- making Codex explain instead of execute when the repository is already available;
- skipping verification because the diff "looks right";
- forcing a huge one-shot prompt instead of staged iterations;
- using higher reasoning as a band-aid for unclear requirements;
- evaluating a new workflow by vibe instead of with repeatable cases.

## 13. Sources

Official OpenAI sources used for this document:

- [Designing delightful frontends with GPT-5.4](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)
- [From prompts to products: One year of Responses](https://developers.openai.com/blog/one-year-of-responses)
- [Using GPT-5.4](https://developers.openai.com/api/docs/guides/latest-model/)
- [Code generation: Use Codex](https://developers.openai.com/api/docs/guides/code-generation/#use-codex)
- [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices/)
- [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices/)
- [GPT-5.4 pro model](https://developers.openai.com/api/docs/models/gpt-5.4-pro)

## 14. Working interpretation

This document intentionally makes one strong interpretation from the official sources:

- OpenAI's current best-practice direction is not "write fancier prompts".
- It is "use the right model, in a stateful workflow, with explicit constraints, visible execution, and continuous evaluation".

That interpretation is mine, but it is directly supported by the linked guidance above.
