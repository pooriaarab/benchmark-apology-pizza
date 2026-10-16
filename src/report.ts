import { bootstrapCI, type Benchmark, type JsonValue, type RunReport } from "benchmark-core";
import type { PizzaTask } from "./environment.js";

export interface ReportBreakdown {
  tasks: number;
  checks: Record<"remedyCorrect" | "amountCorrect" | "verifiedFirst" | "messageAfter", number>;
  policyViolations: Record<string, number>;
}

export interface EnrichedRunReport extends RunReport {
  rows: Array<RunReport["rows"][number] & { details?: JsonValue }>;
  breakdown: ReportBreakdown;
}

interface GradeDetails {
  checks?: Record<string, boolean>;
  policyViolations?: string[];
}

export function summarize(rows: ReadonlyArray<{ details?: JsonValue }>): ReportBreakdown {
  const checks = { remedyCorrect: 0, amountCorrect: 0, verifiedFirst: 0, messageAfter: 0 };
  const policyViolations: Record<string, number> = {};
  for (const row of rows) {
    const details = row.details as GradeDetails | undefined;
    if (!details) continue;
    for (const name of Object.keys(checks) as Array<keyof typeof checks>) if (details.checks?.[name]) checks[name]++;
    for (const code of details.policyViolations ?? []) policyViolations[code] = (policyViolations[code] ?? 0) + 1;
  }
  return { tasks: rows.length, checks, policyViolations };
}

export async function enrichReport(benchmark: Benchmark<PizzaTask>, report: RunReport): Promise<EnrichedRunReport> {
  const seed = Number.isFinite(report.seed) ? report.seed : 1;
  const rows = [] as EnrichedRunReport["rows"];
  for (const row of report.rows) {
    const task = await benchmark.getTask(row.taskId);
    if (!task) throw new Error(`Unknown task id: ${row.taskId}.`);
    const clean = { ...row } as EnrichedRunReport["rows"][number];
    delete clean.details;
    if (row.submission === undefined) {
      if (row.error === undefined) throw new Error(`Row for task ${row.taskId} has no submission to score.`);
      rows.push({ ...clean, score: 0 });
      continue;
    }
    const grade = await benchmark.score(task, row.submission, { seed });
    rows.push({ ...clean, score: grade.score, reason: grade.reason, ...(grade.details !== undefined ? { details: grade.details } : {}) });
  }
  const scores = rows.map((row) => row.score);
  return {
    ...report, rows,
    mean: scores.reduce((sum, value) => sum + value, 0) / scores.length,
    confidenceInterval95: bootstrapCI(scores, seed),
    breakdown: summarize(rows),
  };
}

export function renderBreakdown(report: EnrichedRunReport): string {
  const { checks, policyViolations, tasks } = report.breakdown;
  const violations = Object.entries(policyViolations);
  const lines = ["## Grading breakdown", ""];
  for (const [name, count] of Object.entries(checks)) lines.push(`- ${name}: ${count}/${tasks}`);
  lines.push(`- policyViolations: ${violations.length ? violations.map(([code, count]) => `${code} x${count}`).join(", ") : "none"}`);
  return `${lines.join("\n")}\n`;
}
