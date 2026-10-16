import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { benchmark } from "../dist/index.js";
const execFile = promisify(execFileCallback);
const cli = (...args) => execFile(process.execPath, ["dist/cli.js", ...args], { maxBuffer: 2_000_000 });

await execFile("npm", ["run", "build"]);
const runResult = await cli("run", "--model", "offline", "--provider", "mock", "--json");
const report = JSON.parse(runResult.stdout);
assert.equal(report.rows.length, 40);
assert.ok(report.rows.some((row) => row.score === 1));
assert.ok(report.rows.some((row) => row.score === 0));

assert.ok(report.breakdown);
assert.ok(report.rows.every((row) => row.details !== undefined));

const tasks = await benchmark.listTasks();
const policies = benchmark.definition.mockPolicies;
assert.ok(policies);
const scriptedTrace = (turns) => ({ toolLog: turns.flatMap((turn) => (turn.toolCalls ?? []).map((call) => ({ name: call.name, args: call.args, result: null }))) });
const goodScores = await Promise.all(tasks.map((task) => benchmark.score(task, scriptedTrace(policies.good(task)))));
assert.ok(goodScores.every(({ score }) => score === 1));
const lookup = (task) => ({ name: "lookup_order", args: { orderId: task.input.orderId }, result: null });
const tell = (text) => ({ name: "message_customer", args: { text }, result: null });
const badFamilies = [
  ["empty", () => ({})],
  ["constant-text", () => ({ answer: "purple aardvark" })],
  ["constant-yes", () => ({ answer: "yes" })],
  ["always-refuse", () => ({ answer: "I cannot help with that request." })],
  ["same-tool-call", () => ({ toolLog: [{ name: "issue_refund", args: { amount: 1 }, result: null }] })],
  ["always-credit-five", (task) => ({ toolLog: [lookup(task), { name: "issue_credit", args: { amount: 5 }, result: null }, tell("I added $5 in store credit.")] })],
  ["always-escalate", (task) => ({ toolLog: [lookup(task), { name: "escalate", args: { reason: "manual review" }, result: null }, tell("I escalated this for review.")] })],
  ["always-remake", (task) => ({ toolLog: [lookup(task), { name: "remake_order", args: {}, result: null }, tell("I sent a replacement.")] })],
  ["always-refund-max", (task) => ({ toolLog: [lookup(task), { name: "issue_refund", args: { amount: 35 }, result: null }, tell("I refunded $35.")] })],
];
const badMeans = [];
for (const [name, makeTrace] of badFamilies) {
  const scores = await Promise.all(tasks.map((task) => benchmark.score(task, makeTrace(task))));
  const mean = scores.reduce((sum, value) => sum + value.score, 0) / scores.length;
  assert.ok(mean <= 0.5, `${name} scored ${mean}, expected well below the good policy`);
  badMeans.push([name, mean]);
}
const missing = tasks.find((task) => task.id === "missing-item-1");
assert.ok(missing);
const overCap = await benchmark.score(missing, { toolLog: [
  { name: "lookup_order", args: { orderId: missing.input.orderId }, result: null },
  { name: "issue_refund", args: { amount: 999 }, result: null },
  { name: "message_customer", args: { text: "I refunded the item." }, result: null },
] });
assert.equal(overCap.score, 0);
assert.ok(overCap.details.policyViolations.includes("refund-cap-breach"));

// A live episode may send a message before the remedy; it must still run until
// the resolution message so the replayed score matches the live one.
const { runEpisode } = await import("benchmark-core");
const liveTask = tasks.find((task) => task.expected.remedy === "remake");
assert.ok(liveTask);
const liveTurns = [
  [{ name: "lookup_order", args: { orderId: liveTask.input.orderId } }],
  [{ name: "message_customer", args: { text: "I am on it." } }],
  [{ name: "remake_order", args: {} }],
  [{ name: "message_customer", args: { text: "A fresh pizza is on its way." } }],
];
const scriptedAdapter = {
  id: "scripted",
  complete: async () => ({ content: "" }),
  chat: async (_request, context) => {
    const calls = liveTurns[(context.turn ?? 1) - 1] ?? [];
    return { content: calls.length ? "" : "Done.", toolCalls: calls.map((call, index) => ({ id: `t${context.turn}-${index}`, name: call.name, args: call.args })) };
  },
};
const episode = await runEpisode(liveTask, scriptedAdapter, benchmark.definition.environment(liveTask), { maxTurns: 12, maxToolCalls: 24, budgetUsd: Number.POSITIVE_INFINITY, seed: 1 });
assert.equal(episode.toolLog.filter((entry) => entry.name === "message_customer").length, 2);
const liveScore = await benchmark.score(liveTask, { toolLog: episode.toolLog });
assert.equal(liveScore.score, 1);

// The hidden split must differ in ids, prompts, and answers, and public
// reference answers must score below 1 on it.
const hiddenSeed = 777001;
await execFile(process.execPath, ["scripts/gen-tasks.mjs", "--seed", String(hiddenSeed), "--split", "hidden"]);
const hiddenPath = `hidden/tasks-${hiddenSeed}.jsonl`;
const hiddenTasks = (await readFile(hiddenPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
assert.equal(hiddenTasks.length, 40);
assert.ok(hiddenTasks.every((task) => task.id.startsWith("hz-")));
assert.ok(hiddenTasks.every((task) => !tasks.some((publicTask) => publicTask.id === task.id || publicTask.prompt === task.prompt)));
const referenceScores = await Promise.all(hiddenTasks.map((task) => {
  const reference = tasks.find((publicTask) => publicTask.input.scenario === task.input.scenario);
  assert.ok(reference);
  return benchmark.score(task, scriptedTrace(policies.good(reference)));
}));
assert.ok(referenceScores.every(({ score }) => score < 1));
const hiddenRun = JSON.parse((await cli("run", "--model", "offline", "--provider", "mock", "--tasks", hiddenPath, "--json")).stdout);
assert.equal(hiddenRun.rows.length, hiddenTasks.length);
assert.ok(hiddenRun.breakdown);
assert.equal(JSON.parse((await cli("list", "--tasks", hiddenPath, "--json")).stdout).tasks.length, hiddenTasks.length);

await mkdir("artifacts", { recursive: true });
const reportPath = "artifacts/mock-report.json";
const cardPath = "artifacts/share-card.svg";
await writeFile(reportPath, `${JSON.stringify(report)}\n`);
assert.equal(JSON.parse((await cli("list", "--json")).stdout).tasks.length, 40);
assert.equal(JSON.parse((await cli("show", "wrong-topping-1", "--json")).stdout).task.id, "wrong-topping-1");
assert.equal(JSON.parse((await cli("score", reportPath, "--json")).stdout).rows.length, 40);
await cli("card", reportPath, cardPath);
const card = await readFile(cardPath, "utf8");
assert.match(card, /Apology Pizza/);
assert.match(card, /mock:1/);
assert.match(card, /aibenchmarkindex\.com/);
assert.match((await cli("provenance")).stdout, /Seeded pizza complaint generator/);
const indexEntry = JSON.parse((await cli("index-entry", "--json")).stdout);
assert.equal(indexEntry.task_count, 40);
assert.equal(indexEntry.saturation, "unknown");

const probe = createNetServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const address = probe.address(); assert.ok(address && typeof address === "object");
await new Promise((resolve) => probe.close(resolve));
const server = spawn(process.execPath, ["dist/cli.js", "serve", String(address.port)], { stdio: ["ignore", "pipe", "pipe"] });
const base = `http://127.0.0.1:${address.port}`; const routes = {};
async function get(path) {
  const response = await fetch(`${base}${path}`); routes[`GET ${path}`] = response.status;
  return { response, value: await response.json() };
}
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { await get("/health"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 20)); } }
  assert.equal((await get("/health")).response.status, 200);
  assert.equal((await get("/v1/tasks")).value.tasks.length, 40);
  assert.equal((await get("/v1/tasks/wrong-topping-1")).value.task.id, "wrong-topping-1");
  const score = await fetch(`${base}/v1/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "wrong-topping-1", submission: report.rows[0].submission }) });
  routes["POST /v1/score"] = score.status; assert.equal(score.status, 200);
  assert.ok((await score.json()).details.policyViolations !== undefined);
  const rescored = await fetch(`${base}/v1/score-report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ report }) });
  routes["POST /v1/score-report"] = rescored.status; assert.equal(rescored.status, 200);
  assert.ok((await rescored.json()).breakdown);
  const badReport = await fetch(`${base}/v1/score-report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ report: { rows: [{ taskId: 7, submission: { toolLog: "nope" } }] } }) });
  assert.equal(badReport.status, 400);
  assert.equal((await get("/v1/provenance")).response.status, 200);
  assert.equal((await get("/v1/index-entry")).value.task_count, 40);
} finally { if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); } }

const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/cli.js", "mcp"], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "benchmark-apology-pizza-e2e", version: "0.1.0" });
await client.connect(transport); let toolNames;
try {
  toolNames = (await client.listTools()).tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, ["get_provenance", "get_task", "list_tasks", "run_benchmark", "score_answer"]);
  const calls = [
    ["list_tasks", {}], ["get_task", { taskId: "wrong-topping-1" }],
    ["score_answer", { taskId: "wrong-topping-1", submission: report.rows[0].submission }],
    ["get_provenance", {}], ["run_benchmark", { model: "offline" }],
  ];
  for (const [name, args] of calls) {
    const result = await client.callTool({ name, arguments: args });
    if (name === "run_benchmark") assert.equal(result.isError, true); else assert.notEqual(result.isError, true);
  }
} finally { await client.close(); }

const artifact = { task_count: report.rows.length, scores: report.rows.map((row) => row.score), good_policy_mean: 1, bad_answer_means: Object.fromEntries(badMeans), hidden_task_count: hiddenTasks.length, route_status_codes: routes, tool_names: toolNames };
await writeFile("artifacts/e2e-report.json", `${JSON.stringify(artifact, null, 2)}\n`);
assert.match(await readFile("data/PROVENANCE.md", "utf8"), /Seeded pizza complaint generator/);
console.log(`e2e: ${artifact.task_count} tasks, ${badMeans.length} bad-answer families, ${Object.keys(routes).length} routes, ${toolNames.length} tools -> all surfaces passed, ok`);
