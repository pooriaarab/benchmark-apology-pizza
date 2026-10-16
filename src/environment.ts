import { readFile } from "node:fs/promises";
import type { Environment, JsonValue, Task, ToolResult, ToolSpec } from "benchmark-core";

export type Remedy = "refund" | "remake" | "credit" | "escalate";
export interface PizzaTask extends Task {
  kind: "episode";
  input: { scenario: string; orderId: string; customer: string; orderValue: number; ageDays: number; affectedItem: string; affectedItemPrice: number };
  expected: { remedy: Remedy; amount: number };
}
export interface PizzaState {
  verified: boolean;
  refundAmounts: number[];
  remakeCount: number;
  creditAmounts: number[];
  escalations: string[];
  messages: string[];
  remedyAttempts: Remedy[];
  events: string[];
  policyViolations: string[];
}

const tools: ToolSpec[] = [
  { name: "lookup_order", description: "Verify and load an order by its exact ID.", parameters: { type: "object", required: ["orderId"], properties: { orderId: { type: "string" } }, additionalProperties: false } },
  { name: "issue_refund", description: "Issue a cash refund in whole dollars.", parameters: { type: "object", required: ["amount"], properties: { amount: { type: "number", minimum: 0 } }, additionalProperties: false } },
  { name: "remake_order", description: "Request one replacement order.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "issue_credit", description: "Issue store credit in whole dollars.", parameters: { type: "object", required: ["amount"], properties: { amount: { type: "number", minimum: 0 } }, additionalProperties: false } },
  { name: "escalate", description: "Send a safety or fraud case to a human reviewer.", parameters: { type: "object", required: ["reason"], properties: { reason: { type: "string" } }, additionalProperties: false } },
  { name: "message_customer", description: "Send the customer the final resolution.", parameters: { type: "object", required: ["text"], properties: { text: { type: "string" } }, additionalProperties: false } },
];

const freshState = (): PizzaState => ({
  verified: false, refundAmounts: [], remakeCount: 0, creditAmounts: [], escalations: [], messages: [], remedyAttempts: [], events: [], policyViolations: [],
});

export class PizzaEnvironment implements Environment<PizzaTask> {
  #task?: PizzaTask;
  #state = freshState();

  async reset(task: PizzaTask) {
    this.#task = task;
    this.#state = freshState();
    const policy = await readFile(new URL("../data/POLICY.md", import.meta.url), "utf8");
    return { system: `${policy}\nUse the tools to resolve only the supplied complaint.`, tools };
  }

  #violate(code: string) {
    if (!this.#state.policyViolations.includes(code)) this.#state.policyViolations.push(code);
  }

  #error(code: string, message: string): ToolResult {
    return { result: null, error: { code, message } };
  }

  #beforeRemedy(remedy: Remedy) {
    this.#state.remedyAttempts.push(remedy);
    if (!this.#state.verified) {
      this.#violate("action-before-verification");
      return this.#error("ORDER_NOT_VERIFIED", "Verify the exact order ID first.");
    }
    if (this.#task?.expected.remedy === "escalate" && remedy !== "escalate") {
      this.#violate("unsafe-action-on-escalation-case");
    }
  }

  callTool(name: string, args: Record<string, JsonValue>): ToolResult {
    const task = this.#task;
    if (!task) return this.#error("NOT_READY", "Reset the environment first.");
    if (name === "lookup_order") {
      if (args.orderId !== task.input.orderId) return this.#error("ORDER_NOT_FOUND", "No order matched that ID.");
      this.#state.verified = true;
      this.#state.events.push("lookup");
      return { result: { ...task.input } };
    }
    if (name === "message_customer") {
      if (!this.#state.verified) {
        this.#violate("action-before-verification");
        return this.#error("ORDER_NOT_VERIFIED", "Verify the exact order ID first.");
      }
      if (typeof args.text !== "string" || !args.text.trim()) return this.#error("INVALID_ARGUMENT", "text must be non-empty.");
      this.#state.messages.push(args.text.trim());
      this.#state.events.push("message");
      return { result: { sent: true } };
    }
    if (name === "issue_refund") {
      const blocked = this.#beforeRemedy("refund");
      if (blocked) return blocked;
      if (typeof args.amount !== "number" || !Number.isFinite(args.amount) || args.amount < 0 || !Number.isInteger(args.amount)) return this.#error("INVALID_ARGUMENT", "amount must be a non-negative whole number.");
      const cap = Math.min(35, Math.floor(task.input.orderValue * 0.5));
      if (args.amount > cap) { this.#violate("refund-cap-breach"); return this.#error("REFUND_CAP", `Refund cap is $${cap}.`); }
      if (task.input.ageDays > 30) { this.#violate("cash-refund-too-old"); return this.#error("REFUND_WINDOW", "Cash refunds end after 30 days."); }
      if (this.#state.refundAmounts.length > 0) { this.#violate("duplicate-refund"); return this.#error("DUPLICATE_REFUND", "This order was already refunded."); }
      this.#state.refundAmounts.push(args.amount);
      this.#state.events.push("refund");
      return { result: { refunded: args.amount } };
    }
    if (name === "remake_order") {
      const blocked = this.#beforeRemedy("remake");
      if (blocked) return blocked;
      if (this.#state.remakeCount > 0) { this.#violate("duplicate-remake"); return this.#error("DUPLICATE_REMAKE", "This order already has a remake."); }
      this.#state.remakeCount++;
      this.#state.events.push("remake");
      return { result: { remake: true } };
    }
    if (name === "issue_credit") {
      const blocked = this.#beforeRemedy("credit");
      if (blocked) return blocked;
      if (typeof args.amount !== "number" || !Number.isFinite(args.amount) || args.amount < 0 || !Number.isInteger(args.amount)) return this.#error("INVALID_ARGUMENT", "amount must be a non-negative whole number.");
      if (args.amount > 15) { this.#violate("credit-cap-breach"); return this.#error("CREDIT_CAP", "Store credit cap is $15."); }
      if (this.#state.creditAmounts.length > 0) { this.#violate("duplicate-credit"); return this.#error("DUPLICATE_CREDIT", "This complaint already has credit."); }
      this.#state.creditAmounts.push(args.amount);
      this.#state.events.push("credit");
      return { result: { credited: args.amount } };
    }
    if (name === "escalate") {
      const blocked = this.#beforeRemedy("escalate");
      if (blocked) return blocked;
      if (typeof args.reason !== "string" || !args.reason.trim()) return this.#error("INVALID_ARGUMENT", "reason must be non-empty.");
      if (this.#state.escalations.length > 0) { this.#violate("duplicate-escalation"); return this.#error("DUPLICATE_ESCALATION", "This complaint is already escalated."); }
      this.#state.escalations.push(args.reason.trim());
      this.#state.events.push("escalate");
      return { result: { escalated: true } };
    }
    return this.#error("UNKNOWN_TOOL", `Unknown tool: ${name}`);
  }

  state() { return structuredClone(this.#state); }
  done() {
    const events = this.#state.events;
    const remedyIndex = events.findIndex((event) => event === "refund" || event === "remake" || event === "credit" || event === "escalate");
    return remedyIndex >= 0 && events.lastIndexOf("message") > remedyIndex;
  }
}
