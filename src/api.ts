import { createHandler, type RunReport } from "benchmark-core";
import { benchmark, benchmarkForTasks, enrichReport } from "./index.js";

const json = (value: unknown, status: number) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

function isReport(value: unknown): value is RunReport {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(Reflect.get(value, "rows"));
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
      return json(await enrichReport(await ready, report), 200);
    }
    return (await fallback)(request);
  };
}

export const handler = createApiHandler();
