# Changelog

## 0.2.0 - 2026-10-16

Scoring changed; 0.1.0 results are not comparable with 0.2.0.

- Episodes now end only on a message sent after the remedy, so a
  pre-remedy message no longer truncates a live run below the replayed
  score.
- The grader checks remedy fields instead of undocumented message
  keywords; any non-empty message sent after the remedy counts.
- A refund or credit with the wrong amount now scores zero as the
  `wrong-remedy-amount` policy violation.
- The hidden split uses its own `hz-` id prefix, templates, names,
  seeded scenario mix, and ordering, and writes to
  `hidden/tasks-<seed>.jsonl` outside `data/` so it never ships in the
  npm package.
- The public split adds missing-item orders older than 30 days, which
  resolve as store credit, and the angry-repeat credit now matches the
  written policy of 20% of the order value up to $10.
- Run and score reports carry per-row grader details and a `breakdown`
  with per-check counts and `policyViolations` totals.
- Every surface accepts a task file: `--tasks <path>` on the CLI,
  `tasksPath` in SDK run options and MCP tools,
  `createApiHandler({ tasksPath })`, and `POST /v1/score-report`.

## 0.1.0 - 2026-10-15

Initial public release.
