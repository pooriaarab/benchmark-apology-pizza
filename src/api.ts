import { createHandler, MAX_TOOL_LOG_ENTRIES, type RunReport } from "benchmark-core";
import { benchmark, benchmarkForTasks, enrichReport } from "./index.js";

const MAX_REPORT_ROWS = MAX_TOOL_LOG_ENTRIES;

const json = (value: unknown, status: number) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

function isReport(value: unknown): value is RunReport {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(Reflect.get(value, "rows"));
}

function reportError(rows: unknown[]): string | undefined {
  if (rows.length > MAX_REPORT_ROWS) return `report may not exceed ${MAX_REPORT_ROWS} rows.`;
  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) return "each row must be an object.";
    const taskId = Reflect.get(row, "taskId");
    if (typeof taskId !== "string") return "each row needs a string taskId.";
    const submission = Reflect.get(row, "submission");
    if (submission === undefined) continue;
    if (submission === null || typeof submission !== "object" || Array.isArray(submission)) return "row submission must be an object.";
    const answer = Reflect.get(submission, "answer");
    const toolLog = Reflect.get(submission, "toolLog");
    if (answer !== undefined && typeof answer !== "string") return "row submission answer must be a string.";
    if (toolLog !== undefined && (!Array.isArray(toolLog) || toolLog.length > MAX_TOOL_LOG_ENTRIES)) {
      return `row submission toolLog must be an array of at most ${MAX_TOOL_LOG_ENTRIES} entries.`;
    }
  }
  return undefined;
}

export function createApiHandler(options: { tasksPath?: string } = {}) {
  const ready = options.tasksPath ? benchmarkForTasks(options.tasksPath) : Promise.resolve(benchmark);
  const fallback = ready.then((bench) => createHandler(bench));
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/v1/score-report") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400);
      }
      const report = body !== null && typeof body === "object" ? Reflect.get(body, "report") : undefined;
      if (!isReport(report)) return json({ error: { code: "INVALID_REQUEST", message: "report with a rows array is required." } }, 400);
      const invalid = reportError(report.rows);
      if (invalid) return json({ error: { code: "INVALID_REQUEST", message: invalid } }, 400);
      try {
        return json(await enrichReport(await ready, report), 200);
      } catch (caught) {
        return json({ error: { code: "INVALID_REPORT", message: caught instanceof Error ? caught.message : "Report could not be scored." } }, 400);
      }
    }
    return (await fallback)(request);
  };
}

export const handler = createApiHandler();
