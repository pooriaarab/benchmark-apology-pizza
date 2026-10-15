import { mkdir, writeFile } from "node:fs/promises";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const seed = Number(option("--seed", "20261015"));
const split = option("--split", "public");
if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");
if (!["public", "hidden"].includes(split)) throw new Error("--split must be public or hidden");

function mulberry32(value) {
  return () => {
    value |= 0;
    value = value + 0x6d2b79f5 | 0;
    let result = Math.imul(value ^ value >>> 15, 1 | value);
    result = result + Math.imul(result ^ result >>> 7, 61 | result) ^ result;
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

const random = mulberry32(seed);
const pick = (values) => values[Math.floor(random() * values.length)];
const names = ["Avery", "Cam", "Devon", "Ira", "Jordan", "Kai", "Morgan", "Riley"];
const toppings = ["mushrooms", "olives", "pepperoni", "pineapple", "roasted peppers"];
const streets = ["Oak Lane", "River Road", "Market Street", "Hill Avenue"];
const scenarios = [
  ["wrong-topping", "remake", ({ name, topping }) => `${name} says the pizza arrived with ${topping}, which was not ordered.`],
  ["late", "credit", ({ name, minutes }) => `${name}'s delivery arrived ${minutes} minutes after the quoted window.`],
  ["cold", "remake", ({ name }) => `${name} says the pizza arrived cold and asks you to make it right.`],
  ["missing-item", "refund", ({ name }) => `${name}'s side order is missing from the delivery.`],
  ["customer-address", "credit", ({ name, street }) => `${name} entered ${street} by mistake and the driver could not deliver there.`],
  ["allergen", "escalate", ({ name, topping }) => `${name} reports an allergen mix-up involving ${topping}.`],
  ["angry-repeat", "credit", ({ name }) => `${name}, a repeat customer, is angry that this is the second late order this month.`],
  ["fraud-pattern", "escalate", ({ name }) => `${name}'s account shows three similar refund requests this week.`],
];

const tasks = [];
for (const [scenario, remedy, complaint] of scenarios) {
  for (let variant = 1; variant <= 5; variant++) {
    const orderId = `PZ-${100000 + Math.floor(random() * 900000)}`;
    const itemPrice = 6 + Math.floor(random() * 8);
    const orderValue = itemPrice + 18 + Math.floor(random() * 28);
    const ageDays = scenario === "missing-item" ? 1 + Math.floor(random() * 28) : 1 + Math.floor(random() * 55);
    const creditAmount = scenario === "customer-address" ? 5 : Math.min(10, Math.floor(orderValue * 0.2));
    const expectedAmount = remedy === "refund" ? Math.min(itemPrice, Math.floor(orderValue * 0.5), 35) : remedy === "credit" ? creditAmount : 0;
    const values = { name: pick(names), topping: pick(toppings), street: pick(streets), minutes: 35 + Math.floor(random() * 56) };
    tasks.push({
      id: `${scenario}-${variant}`,
      kind: "episode",
      prompt: `Order ${orderId}. ${complaint(values)} Resolve the complaint under shop policy and tell the customer what happened.`,
      input: { scenario, orderId, customer: values.name, orderValue, ageDays, affectedItem: "side order", affectedItemPrice: itemPrice },
      expected: { remedy, amount: expectedAmount },
      metadata: { seed, split, scenario, variant },
    });
  }
}

await mkdir("data", { recursive: true });
const output = split === "public" ? "data/tasks.jsonl" : "data/tasks.hidden.jsonl";
await writeFile(output, `${tasks.map((task) => JSON.stringify(task)).join("\n")}\n`);
console.log(`generated ${tasks.length} ${split} tasks with seed ${seed} in ${output}`);
