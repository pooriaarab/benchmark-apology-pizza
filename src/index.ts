import { readFile } from "node:fs/promises";
import { defineBenchmark, run as runBenchmark, type Benchmark, type ModelAdapter, type RunOptions, type Trace } from "benchmark-core";
import { benchmark } from "./benchmark.js";
import type { PizzaTask } from "./environment.js";
import { enrichReport, type EnrichedRunReport } from "./report.js";

export { benchmark };
export { enrichReport, renderBreakdown, summarize, type EnrichedRunReport, type ReportBreakdown } from "./report.js";
export { PizzaEnvironment, type PizzaState, type PizzaTask, type Remedy } from "./environment.js";

export interface PizzaRunOptions extends RunOptions {
  tasksPath?: string;
}

export async function loadTasksFrom(path: string): Promise<PizzaTask[]> {
  const text = await readFile(path, "utf8");
  return text.trim().split("\n").map((line) => JSON.parse(line) as PizzaTask);
}

export async function benchmarkForTasks(path: string): Promise<Benchmark<PizzaTask>> {
  const tasks = await loadTasksFrom(path);
  const { loadTasks: _loadTasks, ...rest } = benchmark.definition;
  return defineBenchmark<PizzaTask>({ ...rest, tasks });
}

export async function run(adapter: ModelAdapter, options?: PizzaRunOptions): Promise<EnrichedRunReport> {
  const { tasksPath, ...rest } = options ?? {};
  const bench = tasksPath ? await benchmarkForTasks(tasksPath) : benchmark;
  return enrichReport(bench, await runBenchmark(bench, adapter, rest));
}

export async function score(taskId: string, submission: Trace) {
  const task = await benchmark.getTask(taskId); if (!task) throw new Error(`Task not found: ${taskId}`);
  return benchmark.score(task, submission);
}
