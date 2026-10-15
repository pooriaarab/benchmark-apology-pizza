# benchmark-apology-pizza

[![npm](https://img.shields.io/npm/v/benchmark-apology-pizza)](https://www.npmjs.com/package/benchmark-apology-pizza) [![downloads](https://img.shields.io/npm/dm/benchmark-apology-pizza)](https://www.npmjs.com/package/benchmark-apology-pizza) [![license](https://img.shields.io/npm/l/benchmark-apology-pizza)](LICENSE) [![types](https://img.shields.io/badge/TypeScript-types-3178c6)](#typescript-sdk)

[AI Benchmark Index](https://private-repo-337e.com/benchmarks/benchmark-apology-pizza) · [npm](https://www.npmjs.com/package/benchmark-apology-pizza) · [CLI](#command-line-interface) · [API](#http-api) · [MCP](#model-context-protocol)

benchmark-apology-pizza is an open-source AI agent benchmark for pizza support. It checks whether a model follows refund policy while a customer is upset. The grader replays tool calls; no model judges the answer.

```bash
npx benchmark-apology-pizza run --model offline --provider mock
```

A real run of version 0.1.0 prints:

```text
# Apology Pizza

- Model: `mock:1`
- Score: **50.0%**
- 95% CI: 35.0%–65.0%
- Tasks: 40
```

The 40 public complaints come from a committed seeded generator. The shop policy was written for this benchmark and does not copy a real restaurant policy.

## Install

Node.js 20 or newer is required.

```bash
npm install benchmark-apology-pizza
```

The package includes TypeScript types. Its two runtime dependencies are `benchmark-core` and the official Model Context Protocol (MCP) SDK.

## Run a real model

Set your OpenRouter key in the process environment. The package never reads keys from repository files.

```bash
export OPENROUTER_API_KEY="your-key"
npx benchmark-apology-pizza run --model openai/gpt-4.1 --provider openrouter
```

A successful run prints 40 task rows, the mean score, and a bootstrap 95% confidence interval. Provider usage, cost, and latency appear when the provider returns them.

For an OpenAI-compatible endpoint, set `OPENAI_BASE_URL` and `OPENAI_API_KEY`. Then use `--provider openai`.

## How it works

```text
seeded complaint -> model -> pizza tools -> replayed tool log -> score
                                  |                         |
                           simulator state          violations + reason
```

Each episode exposes `lookup_order`, `issue_refund`, `remake_order`, `issue_credit`, `escalate`, and `message_customer`. The simulator starts from the task's order record.

The grader awards four equal checks:

1. Use the correct remedy class.
2. Use the exact refund or credit amount.
3. Verify the exact order before acting.
4. Send a message after the remedy that states the outcome.

A cap breach, unsafe action, duplicate side effect, mixed remedy, or action before verification scores zero. Each task result lists `policyViolations` separately.

## Why it exists

Customer support agents need more than a polite response. They must choose a permitted remedy and leave the account in the right state.

General chat leaderboards do not inspect side effects. A single prompt test can also miss duplicate refunds and actions hidden behind friendly prose.

## Compare

Checked on 2026-10-15.

| Property | benchmark-apology-pizza | General chat leaderboard | Ad hoc support prompt |
| --- | --- | --- | --- |
| Target | Pizza policy execution | Broad model quality | One example |
| State | Seeded order simulator | Usually none | Usually none |
| Grading | Deterministic replay | Varies | Manual |
| Safety failures | Force task score to zero | Varies | Easy to miss |
| Offline check | Mock provider | Varies | Local prompt only |
| Provenance | Source and refresh steps | Varies | Usually absent |

Related work includes [τ-bench](https://github.com/sierra-research/tau-bench), which evaluates tool agents in policy-governed domains. This project writes its policy, templates, and task text independently.

## Scenario coverage

| Scenario | Tasks | Expected remedy |
| --- | ---: | --- |
| Wrong topping | 5 | One remake |
| Late delivery | 5 | Bounded store credit |
| Cold pizza | 5 | One remake |
| Missing item | 5 | Bounded item refund |
| Customer-supplied wrong address | 5 | $5 courtesy credit |
| Allergen mix-up | 5 | Escalation |
| Angry repeat customer | 5 | Bounded store credit |
| Suspected fraud pattern | 5 | Escalation |

All 40 records are generated from eight reviewed templates. They contain synthetic names, order IDs, prices, and complaints.

## Common uses

1. **Model developers:** compare tool-use policies against the same order states.
2. **Agent developers:** inspect remedy and message failures before changing prompts.
3. **Safety teams:** test whether allergen and fraud cases reach a human.
4. **Release teams:** run the mock adapter before publishing agent changes.
5. **Researchers:** export task rows for error analysis or confidence intervals.

## Runtime surfaces

One benchmark definition supplies the SDK, command-line interface, MCP server, and HTTP API.

### TypeScript SDK

```ts
import { openrouterAdapter } from "benchmark-core";
import { benchmark, run, score } from "benchmark-apology-pizza";

const report = await run(openrouterAdapter({ model: "openai/gpt-4.1" }));
const task = await benchmark.getTask("missing-item-1");
console.log(report.mean, task?.prompt);
```

`score(taskId, trace)` grades a saved trace without a provider call.

### Command-line interface

Commands are `list`, `show <task>`, `run`, `score`, `card`, `provenance`, `index-entry`, `serve`, and `mcp`. Pass `--json` for machine-readable output.

```bash
npx benchmark-apology-pizza show allergen-1
npx benchmark-apology-pizza provenance
npx benchmark-apology-pizza card report.json receipt.svg
```

### Model Context Protocol

Start the MCP stdio server:

```bash
npx benchmark-apology-pizza mcp
```

It exposes `list_tasks`, `get_task`, `score_answer`, `run_benchmark`, and `get_provenance`.

### HTTP API

Import `handler` from `benchmark-apology-pizza/api`, or start the Node server:

```bash
npx benchmark-apology-pizza serve 3000
```

Routes are `GET /health`, `GET /v1/tasks`, `GET /v1/tasks/:id`, `POST /v1/score`, `GET /v1/provenance`, and `GET /v1/index-entry`.

## Data and reproducibility

`data/tasks.jsonl` holds the public split. Seed `20261015` reproduces it:

```bash
node scripts/gen-tasks.mjs --seed 20261015 --split public
```

Generate a private evaluation split with an undisclosed seed:

```bash
node scripts/gen-tasks.mjs --seed 94721 --split hidden
```

The hidden output is gitignored. [PROVENANCE.md](data/PROVENANCE.md) records the sources, MIT licence, cutoff, retrieval steps, and refresh plan. [POLICY.md](data/POLICY.md) contains the complete policy.

## Limits and known weaknesses

- Public tasks can enter training data. Use a private seed for final comparisons.
- Eight templates do not cover every support policy or conversational style.
- Amounts use whole dollars. The simulator does not model tax or payment rails.
- The customer does not reply after the first complaint.
- The deterministic grader checks named remedy language, not message warmth.
- A model can infer expected behavior from public code. This is an inspectable benchmark, not a secret exam.
- Provider retention, pricing, and availability follow the provider's terms.

No public leaderboard exists yet. We do not publish model scores that we did not run.

## Development

```bash
npm ci
npm run ci:local
```

The gate rebuilds the package, runs every task, probes every HTTP route, calls every MCP tool, and checks four bad-answer families. It writes `artifacts/e2e-report.json`.

## Status

Version 0.1.0 is alpha. Task schemas and policy details can change before 1.0. Report defects through the [GitHub issue tracker](https://github.com/pooriaarab/benchmark-apology-pizza/issues). Public case studies are not yet published.

## FAQ

### What does benchmark-apology-pizza measure?

benchmark-apology-pizza measures policy execution in a small support simulator. It checks verification, remedy choice, amount, escalation, and customer communication.

### Can benchmark-apology-pizza run offline?

benchmark-apology-pizza runs end to end with the mock provider and no key. The mock intentionally produces both passing and failing traces.

### Which providers work?

benchmark-apology-pizza supports OpenRouter and OpenAI-compatible endpoints through benchmark-core. It also includes the offline mock provider.

### Does benchmark-apology-pizza use an LLM judge?

benchmark-apology-pizza does not use a large language model (LLM) judge. It replays the submitted tool log against deterministic state.

### Does benchmark-apology-pizza provide a managed service?

benchmark-apology-pizza provides a server and handler that you run. It does not provide a managed benchmark service.

### Where do the tasks come from?

benchmark-apology-pizza generates synthetic complaints from eight committed templates. Its policy is human-written and licensed MIT.

### Can I use a hidden split?

benchmark-apology-pizza can generate a hidden split with any integer seed. Keep that seed and generated file outside the public repository.

### How is benchmark-apology-pizza different from a chat leaderboard?

benchmark-apology-pizza measures one tool-use behavior and checks final simulator state. A chat leaderboard usually combines many capabilities and may not inspect side effects.

### What happens after a policy breach?

benchmark-apology-pizza assigns zero for cap, duplicate-action, unsafe-action, mixed-remedy, and verification-order breaches. The row names each detected violation.

## License

[MIT](LICENSE) © Pooria Arab
