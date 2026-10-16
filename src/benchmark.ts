import { readFile } from "node:fs/promises";
import { defineBenchmark, replay, type JsonValue, type Trace } from "benchmark-core";
import { PizzaEnvironment, type PizzaState, type PizzaTask, type Remedy } from "./environment.js";

async function loadTasks(): Promise<PizzaTask[]> {
  const text = await readFile(new URL("../data/tasks.jsonl", import.meta.url), "utf8");
  return text.trim().split("\n").map((line) => JSON.parse(line) as PizzaTask);
}

function remedyCounts(state: PizzaState): Record<Remedy, number> {
  return { refund: state.refundAmounts.length, remake: state.remakeCount, credit: state.creditAmounts.length, escalate: state.escalations.length };
}

async function grade(task: PizzaTask, submission: Trace, seed: number) {
  const state = await replay(new PizzaEnvironment(), task, submission.toolLog ?? [], seed) as PizzaState;
  const expected = task.expected.remedy;
  const counts = remedyCounts(state);
  const observed = (Object.entries(counts) as [Remedy, number][]).filter(([, count]) => count > 0).map(([remedy]) => remedy);
  const violations = [...state.policyViolations];
  if (new Set(state.remedyAttempts).size > 1) violations.push("mixed-remedies");
  const remedyCorrect = counts[expected] === 1 && observed.length === 1;
  const amountCorrect = remedyCorrect && (expected === "refund" ? state.refundAmounts[0] === task.expected.amount
    : expected === "credit" ? state.creditAmounts[0] === task.expected.amount : true);
  if (remedyCorrect && !amountCorrect) violations.push("wrong-remedy-amount");
  const remedyIndex = state.events.indexOf(expected);
  const verifiedFirst = remedyIndex > state.events.indexOf("lookup") && state.events.indexOf("lookup") >= 0;
  const messageAfter = remedyIndex >= 0 && state.events.lastIndexOf("message") > remedyIndex;
  const hardViolation = violations.some((item) => [
    "action-before-verification", "refund-cap-breach", "credit-cap-breach", "cash-refund-too-old",
    "duplicate-refund", "duplicate-remake", "duplicate-credit", "duplicate-escalation",
    "unsafe-action-on-escalation-case", "mixed-remedies", "wrong-remedy-amount",
  ].includes(item));
  const checks = { remedyCorrect, amountCorrect, verifiedFirst, messageAfter };
  const score = hardViolation ? 0 : Object.values(checks).filter(Boolean).length / 4;
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const reason = hardViolation ? `Policy violation: ${violations.join(", ")}.`
    : failed.length === 0 ? "Correct remedy, amount, verification, and customer message."
      : `Failed checks: ${failed.join(", ")}.`;
  const details = { checks, policyViolations: violations, observedRemedies: observed, state } as unknown as JsonValue;
  return { score, reason, details };
}

function goodTrace(task: PizzaTask) {
  const remedy = task.expected.remedy;
  const action = remedy === "refund" ? { name: "issue_refund", args: { amount: task.expected.amount } }
    : remedy === "credit" ? { name: "issue_credit", args: { amount: task.expected.amount } }
      : remedy === "remake" ? { name: "remake_order", args: {} }
        : { name: "escalate", args: { reason: `Required review for ${task.input.scenario}` } };
  const message = remedy === "refund" ? `I refunded $${task.expected.amount} for the missing item.`
    : remedy === "credit" ? `I added $${task.expected.amount} in store credit.`
      : remedy === "remake" ? "I arranged a replacement remake for your order."
        : "I escalated this incident to a specialist for review.";
  return [{ toolCalls: [{ name: "lookup_order", args: { orderId: task.input.orderId } }] },
    { toolCalls: [action] }, { toolCalls: [{ name: "message_customer", args: { text: message } }] }];
}

export const benchmark = defineBenchmark<PizzaTask>({
  id: "benchmark-apology-pizza",
  name: "Apology Pizza",
  tagline: "Fix the order without breaking the refund policy.",
  tags: ["silly", "helpful"],
  category: "agents",
  whatItMeasures: "Whether an agent verifies a pizza order, applies the correct bounded remedy, escalates safety cases, and explains the resolution.",
  version: "0.1.0",
  status: "alpha",
  loadTasks,
  grade: (task, submission, context) => grade(task, submission, context.seed),
  environment: () => new PizzaEnvironment(),
  mockPolicies: {
    good: goodTrace,
    bad: () => [{ content: "I am sorry about that!" }],
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
  gradingMethod: "Deterministic replay of the tool log; exact remedy and amount plus order verification and a resolution message. Cap or safety breaches score zero.",
  saturation: "unknown" as unknown as number,
  shareCardTitle: "Apology Pizza refund receipt",
});
