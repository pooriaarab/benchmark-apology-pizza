#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  bootstrapCI, createCli, mockAdapter, openaiCompatAdapter, openrouterAdapter, renderMarkdown,
  run as runCore, serve as serveHttp, type Benchmark, type ModelAdapter, type RunReport,
} from "benchmark-core";
import { createApiHandler } from "./api.js";
import { benchmark, benchmarkForTasks, enrichReport } from "./index.js";
import { startMcp } from "./mcp.js";
import { renderBreakdown, summarize, type EnrichedRunReport } from "./report.js";
import type { PizzaTask } from "./environment.js";

const bin = "benchmark-apology-pizza";
const usage = `Usage: ${bin} <list|show|run|score|card|provenance|index-entry|serve|mcp> [--tasks <path>] [options]`;

function adapter(provider: string, model: string, bench: Benchmark<PizzaTask>, seed: number): ModelAdapter {
  if (provider === "mock") return mockAdapter({ seed, ...(bench.definition.mockPolicies ? { policies: bench.definition.mockPolicies } : {}) });
  if (provider === "openrouter") return openrouterAdapter({ model });
  if (provider === "openai") return openaiCompatAdapter({ model });
  throw new Error("--provider must be openrouter, openai, or mock.");
}

function print(report: EnrichedRunReport, json: boolean) {
  console.log(json ? JSON.stringify(report) : renderMarkdown(report) + renderBreakdown(report));
}

async function runCommand(args: string[], bench: Benchmark<PizzaTask>): Promise<number> {
  const parsed = parseArgs({
    args,
    options: {
      model: { type: "string" }, provider: { type: "string" }, concurrency: { type: "string" },
      timeout: { type: "string" }, retries: { type: "string" }, seed: { type: "string" },
      "max-turns": { type: "string" }, "max-tool-calls": { type: "string" }, budget: { type: "string" },
      json: { type: "boolean" },
    },
    strict: true,
  });
  const { model, provider } = parsed.values;
  if (!model || !provider) throw new Error(`run needs --model and --provider.\n${usage}`);
  const seed = Number(parsed.values.seed ?? 1);
  const report = await runCore(bench, adapter(provider, model, bench, seed), {
    ...(parsed.values.concurrency ? { concurrency: Number(parsed.values.concurrency) } : {}),
    ...(parsed.values.timeout ? { timeoutMs: Number(parsed.values.timeout) } : {}),
    ...(parsed.values.retries ? { retries: Number(parsed.values.retries) } : {}),
    seed,
    ...(parsed.values["max-turns"] ? { maxTurns: Number(parsed.values["max-turns"]) } : {}),
    ...(parsed.values["max-tool-calls"] ? { maxToolCalls: Number(parsed.values["max-tool-calls"]) } : {}),
    ...(parsed.values.budget ? { budgetUsd: Number(parsed.values.budget) } : {}),
  });
  const enriched = await enrichReport(bench, report);
  print(enriched, parsed.values.json === true);
  return enriched.rows.some((row) => row.error) ? 2 : 0;
}

async function scoreCommand(args: string[], bench: Benchmark<PizzaTask>): Promise<number> {
  const parsed = parseArgs({ args, options: { json: { type: "boolean" } }, allowPositionals: true, strict: true });
  const file = parsed.positionals[0];
  if (!file) throw new Error(`score needs a results JSON file.\n${usage}`);
  const original = JSON.parse(await readFile(file, "utf8")) as RunReport;
  if (!Array.isArray(original.rows)) throw new Error("File is not a run report.");
  const rows = [] as EnrichedRunReport["rows"];
  for (const row of original.rows) {
    const task = await bench.getTask(row.taskId);
    if (!task || row.submission === undefined) throw new Error(`Cannot score task ${row.taskId}.`);
    const grade = await bench.score(task, row.submission, { seed: original.seed });
    rows.push({ ...row, score: grade.score, reason: grade.reason, ...(grade.details !== undefined ? { details: grade.details } : {}) });
  }
  const scores = rows.map((row) => row.score);
  const enriched: EnrichedRunReport = {
    ...original, rows,
    mean: scores.reduce((sum, value) => sum + value, 0) / scores.length,
    confidenceInterval95: bootstrapCI(scores, original.seed),
    breakdown: summarize(rows),
  };
  print(enriched, parsed.values.json === true);
  return 0;
}

async function serveCommand(args: string[], tasksPath?: string): Promise<number> {
  const parsed = parseArgs({ args, options: { host: { type: "string" }, json: { type: "boolean" } }, allowPositionals: true, strict: true });
  if (parsed.positionals.length > 1) throw new Error(`serve accepts at most one port.\n${usage}`);
  const port = Number(parsed.positionals[0] ?? process.env.PORT ?? 3000);
  const hostname = parsed.values.host ?? "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("serve port must be an integer from 0 to 65535.");
  if (!hostname.trim()) throw new Error("--host must not be empty.");
  await serveHttp(createApiHandler(tasksPath ? { tasksPath } : {}), { port, hostname });
  console.log(parsed.values.json ? JSON.stringify({ listening: port, host: hostname }) : `Listening on http://${hostname}:${port}`);
  return 0;
}

async function main(argv: string[]): Promise<number> {
  try {
    let tasksPath: string | undefined;
    const clean: string[] = [];
    for (let index = 0; index < argv.length; index++) {
      if (argv[index] === "--tasks") {
        tasksPath = argv[++index];
        if (!tasksPath || tasksPath.startsWith("--")) throw new Error(`--tasks needs a JSONL file path.\n${usage}`);
      } else clean.push(argv[index]!);
    }
    const command = clean[0];
    const bench = tasksPath ? await benchmarkForTasks(tasksPath) : benchmark;
    if (command === "run") return await runCommand(clean.slice(1), bench);
    if (command === "score") return await scoreCommand(clean.slice(1), bench);
    if (command === "serve") return await serveCommand(clean.slice(1), tasksPath);
    if (command === "mcp") { await startMcp(bench); return 0; }
    return await createCli(bench, { bin }).main(clean);
  } catch (caught) {
    console.error(caught instanceof Error ? caught.message : String(caught));
    return 2;
  }
}

process.exitCode = await main(process.argv.slice(2));
