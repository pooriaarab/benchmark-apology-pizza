# Working on benchmark-apology-pizza

## Purpose

This package measures whether an agent can resolve a pizza complaint without breaking a refund policy. All grading is deterministic and replays the submitted tool log.

## Commands

- Install with `npm ci`.
- Run the full gate with `npm run ci:local`.
- Generate public tasks with `node scripts/gen-tasks.mjs --seed 20261015 --split public`.
- Generate a private split with `node scripts/gen-tasks.mjs --seed <seed> --split hidden`.
- Regenerate provenance after building with `npm run provenance`.

## Contracts

Keep `data/POLICY.md`, the scenario generator, simulator, grader, and provenance in sync. Preserve 40 public tasks across the eight documented scenario classes.

Grade episode traces by replaying their tool log. Never trust `finalState`. A cap, duplicate side effect, unsafe action, mixed remedy, or action before verification must score zero.

Write failure modes in `docs/grading.md` before grader code. Add no unit tests. Extend `scripts/e2e.mjs` through a public surface, including good-policy and bad-answer checks.

Never read provider keys from repository files. OpenRouter uses `OPENROUTER_API_KEY`. OpenAI-compatible providers use `OPENAI_BASE_URL` and `OPENAI_API_KEY`.

## Contributions

Open an issue before a branch. Use `bapz-<issue>-<slug>` and `[bapz-<issue>] Imperative subject`. Keep pull requests below 500 counted lines. Do not merge your own pull request or push `release`.
