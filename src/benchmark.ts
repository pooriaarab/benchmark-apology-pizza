import { readFile } from "node:fs/promises";
import { defineBenchmark, exactMatch, replay, type Environment, type JsonValue, type Task, type ToolResult } from "benchmark-core";

async function loadTasks(): Promise<Task[]> {
  const text = await readFile(new URL("../data/tasks.jsonl", import.meta.url), "utf8");
  return text.trim().split("\n").map((line) => JSON.parse(line) as Task);
}
class StarterEnvironment implements Environment {
  #finished = false;
  reset() {
    this.#finished = false;
    return { system: "Call finish_task once, then stop.", tools: [{ name: "finish_task", description: "Mark the task finished.", parameters: { type: "object" as const, properties: {}, additionalProperties: false } }] };
  }
  callTool(name: string, _args: Record<string, JsonValue>): ToolResult {
    if (name !== "finish_task") return { result: null, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${name}` } };
    this.#finished = true; return { result: { finished: true } };
  }
  state() { return { finished: this.#finished }; }
  done() { return this.#finished; }
}
export const benchmark = defineBenchmark({
  id: "benchmark-apology-pizza", name: "Apology Pizza", tagline: "Fix a wrong pizza order inside a refund policy.", tags: ["silly","helpful"], category: "agents",
  whatItMeasures: "Fix a wrong pizza order inside a refund policy.", version: "0.1.0", status: "alpha", loadTasks,
  async grade(task, submission, context) {
    if (task.kind === "single") return submission.answer === undefined ? { score: 0, reason: "Submission has no answer." } : exactMatch(task.expected ?? null, submission.answer);
    const state = await replay(new StarterEnvironment(), task, submission.toolLog ?? [], context.seed) as { finished?: boolean };
    return state.finished ? { score: 1, reason: "The trace finished the task." } : { score: 0, reason: "The trace did not finish the task." };
  },
  environment: () => new StarterEnvironment(),
  mockPolicies: {
    good: (task) => task.kind === "episode" ? [{ toolCalls: [{ name: "finish_task", args: {} }] }] : [],
    bad: (task) => task.kind === "episode" ? [{ content: "Skipped the tool." }] : [],
  },
  provenance: [{
    name: "Seeded pizza complaint generator", kind: "synthetic", url: "https://github.com/pooriaarab/benchmark-apology-pizza/blob/main/scripts/gen-tasks.mjs",
    licence: "MIT", howToGet: "Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root.", retrievedAt: "2026-10-15T00:00:00.000Z",
    contaminationNotes: "The public split uses seed 20261015. Generate private hidden splits with an undisclosed seed after the 2026-10-15 cutoff.",
    refresh: "Review templates annually, select a new seed, regenerate, and review the JSONL diff.",
  }, {
    name: "Apology Pizza support policy", kind: "human-written", url: "https://github.com/pooriaarab/benchmark-apology-pizza/blob/main/data/POLICY.md",
    licence: "MIT", howToGet: "Read `data/POLICY.md` in this repository.", retrievedAt: "2026-10-15T00:00:00.000Z",
    contaminationNotes: "Written for this benchmark and public from 2026-10-15; it does not reproduce a real shop policy.",
    refresh: "Review with every scenario-template change and update tasks and grading in the same pull request.",
  }],
  gradingMethod: "Exact match for single answers; deterministic state replay for episodes.",
});
