import type { Benchmark, JsonValue, RunReport } from "benchmark-core";
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
  const rows = [] as EnrichedRunReport["rows"];
  for (const row of report.rows) {
    let details: JsonValue | undefined;
    if (row.submission !== undefined) {
      const task = await benchmark.getTask(row.taskId);
      if (task) details = (await benchmark.score(task, row.submission, { seed: report.seed })).details;
    }
    rows.push(details === undefined ? row : { ...row, details });
  }
  return { ...report, rows, breakdown: summarize(rows) };
}

export function renderBreakdown(report: EnrichedRunReport): string {
  const { checks, policyViolations, tasks } = report.breakdown;
  const violations = Object.entries(policyViolations);
  const lines = ["## Grading breakdown", ""];
  for (const [name, count] of Object.entries(checks)) lines.push(`- ${name}: ${count}/${tasks}`);
  lines.push(`- policyViolations: ${violations.length ? violations.map(([code, count]) => `${code} x${count}`).join(", ") : "none"}`);
  return `${lines.join("\n")}\n`;
}
