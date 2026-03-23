# Personal Codex Cheatsheet

Last updated: 2026-03-23

This file is the short version. Use it when you do not want theory, only reusable prompts and operating defaults.

## 1. Default rules

- Start with `gpt-5.4` for most coding work.
- Raise reasoning only after the task statement is already clear.
- For long or hard multi-step work, treat it like a background workflow, not a one-shot request.
- Every non-trivial task must include verification.
- For frontend work, specify design direction and visual constraints before implementation.

## 2. Golden request format

```text
Goal:

Scope:

Constraints:

Verification:
```

## 3. Coding fix template

```text
Goal:
Fix [bug] in the current repo.

Scope:
Only touch [files/modules].

Constraints:
Do not change [API/schema/behavior]. Prefer the smallest coherent fix.

Execution:
Inspect the current implementation first, then edit.

Verification:
Run [check/test/build]. If something cannot be verified, say so explicitly.

Output:
Summarize changes, verification, and remaining risks.
```

## 4. Refactor template

```text
Goal:
Refactor [target] to reduce complexity without changing behavior.

Scope:
Only touch [files/modules].

Must preserve:
Existing behavior, public APIs, and test expectations.

Do not:
Introduce new abstractions unless they clearly simplify the code.

Verification:
Run [tests/checks]. Call out any behavior that is still assumption-based.
```

## 5. Code review template

```text
Review this change for bugs, regressions, hidden coupling, and missing tests.
Findings first. Keep the summary brief.
If there are no findings, say so explicitly and list residual risks or testing gaps.
```

## 6. Frontend implementation template

```text
Goal:
Implement/refine [page/component].

Product intent:
Explain how the screen is used in practice.

Visual direction:
Describe the desired design language in plain language.

Density:
Compact / balanced / spacious.

Avoid:
List what the UI must not feel like.

Constraints:
Keep current design system / may restyle visually / do not change IA / do not add libraries.

Verification:
Run typecheck/build and check responsive behavior plus console errors.
```

## 7. Frontend exploration template

```text
Before implementing, propose 3 distinct visual directions for [page/component].
For each direction, explain:
- what it optimizes for,
- where it may fail,
- what kind of product it fits.

Then stop and wait for selection.
```

## 8. Debugging template

```text
Goal:
Find the root cause of [bug].

Execution:
Inspect logs/code/runtime evidence first. Do not jump to the fix before narrowing the cause.

Output:
1. Most likely root cause
2. Supporting evidence
3. Minimal fix
4. Verification plan
```

## 9. Prompt-upgrade template

```text
Rewrite this prompt for GPT-5.4.
Preserve the original intent.
Remove vague wording and redundant instruction.
Make the task easier to execute reliably.
Return:
1. revised prompt
2. key changes
3. any assumptions or compatibility risks
```

## 10. Anti-slop frontend constraints

Paste these when needed:

```text
Avoid generic SaaS gradients, oversized cards, decorative whitespace, and default AI-looking layouts.
Prioritize information hierarchy, spacing discipline, and interaction clarity.
Use motion only when it improves comprehension.
```

## 11. Verification phrases that work well

Use one or more:

- `Run the relevant checks after editing.`
- `If the first check fails because of a local follow-up issue, fix it and rerun.`
- `Report what you verified and what remains unverified.`
- `Do not stop at analysis if the repo context is sufficient to implement the change.`
- `Prefer the smallest coherent change over a broad rewrite.`

## 12. Personal regression set

Keep 4 reusable tasks:

- normal case;
- edge case;
- failure case;
- ambiguous case.

If a new model or prompting style performs worse on any of them, do not adopt it as your default.

## 13. Sources

- [Using GPT-5.4](https://developers.openai.com/api/docs/guides/latest-model/)
- [Code generation: Use Codex](https://developers.openai.com/api/docs/guides/code-generation/#use-codex)
- [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices/)
- [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices/)
- [Designing delightful frontends with GPT-5.4](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)
