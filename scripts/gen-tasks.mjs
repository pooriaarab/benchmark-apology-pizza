import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const split = option("--split", "public");
if (!["public", "hidden"].includes(split)) throw new Error("--split must be public or hidden");
// A hidden split needs a private seed; a default in public source would let anyone regenerate it.
if (split === "hidden" && process.argv.indexOf("--seed") < 0) throw new Error("--split hidden requires an explicit private --seed");
const seed = Number(option("--seed", "20261015"));
if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");

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
const between = (low, high) => low + Math.floor(random() * (high - low + 1));

const itemRefund = (item, order) => Math.min(item, Math.floor(order * 0.5), 35);
const lateCredit = (order) => Math.min(10, Math.floor(order * 0.2));

const pools = {
  public: {
    names: ["Avery", "Cam", "Devon", "Ira", "Jordan", "Kai", "Morgan", "Riley"],
    toppings: ["mushrooms", "olives", "pepperoni", "pineapple", "roasted peppers"],
    streets: ["Oak Lane", "River Road", "Market Street", "Hill Avenue"],
    items: ["side order"],
    itemPrice: () => between(6, 13),
    orderBase: () => between(18, 45),
    minutes: () => between(35, 90),
  },
  hidden: {
    names: ["Blair", "Casey", "Emerson", "Finley", "Harper", "Noa", "Quinn", "Sage"],
    toppings: ["anchovies", "jalapenos", "sun-dried tomatoes", "extra mozzarella", "spinach"],
    streets: ["Cedar Court", "Willow Way", "Sunset Boulevard", "Canal Street"],
    items: ["side order", "garlic dip", "soda bottle"],
    itemPrice: () => between(5, 14),
    orderBase: () => between(22, 52),
    minutes: () => between(40, 105),
  },
};

const instruction = {
  public: "Resolve the complaint under shop policy and tell the customer what happened.",
  hidden: "Work the ticket under the shop policy, then send the customer the outcome.",
};

// Each row: [scenario key, id alias, base variant count, draw(context, variant)].
// draw returns { remedy, amount, ageDays, complaint } for one task.
const publicScenarios = [
  ["wrong-topping", "wrong-topping", 5, (c) => ({ remedy: "remake", amount: 0, ageDays: between(1, 55),
    complaint: `${c.name} says the pizza arrived with ${c.topping}, which was not ordered.` })],
  ["late", "late", 5, (c) => ({ remedy: "credit", amount: lateCredit(c.orderValue), ageDays: between(1, 55),
    complaint: `${c.name}'s delivery arrived ${c.minutes} minutes after the quoted window.` })],
  ["cold", "cold", 5, (c) => ({ remedy: "remake", amount: 0, ageDays: between(1, 55),
    complaint: `${c.name} says the pizza arrived cold and asks you to make it right.` })],
  ["missing-item", "missing-item", 5, (c, variant) => {
    const stale = variant > 3;
    return { remedy: stale ? "credit" : "refund",
      amount: stale ? Math.min(c.itemPrice, 15) : itemRefund(c.itemPrice, c.orderValue),
      ageDays: stale ? between(31, 60) : between(1, 28),
      complaint: stale
        ? `${c.name}'s ${c.item} never arrived, and the order is more than a month old.`
        : `${c.name}'s ${c.item} is missing from the delivery.` };
  }],
  ["customer-address", "customer-address", 5, (c) => ({ remedy: "credit", amount: 5, ageDays: between(1, 55),
    complaint: `${c.name} entered ${c.street} by mistake and the driver could not deliver there.` })],
  ["allergen", "allergen", 5, (c) => ({ remedy: "escalate", amount: 0, ageDays: between(1, 55),
    complaint: `${c.name} reports an allergen mix-up involving ${c.topping}.` })],
  ["angry-repeat", "angry-repeat", 5, (c) => ({ remedy: "credit", amount: lateCredit(c.orderValue), ageDays: between(1, 55),
    complaint: `${c.name}, a repeat customer, is angry that this is the second late order this month.` })],
  ["fraud-pattern", "fraud-pattern", 5, (c) => ({ remedy: "escalate", amount: 0, ageDays: between(1, 55),
    complaint: `${c.name}'s account shows three similar refund requests this week.` })],
];

const hiddenScenarios = [
  ["wrong-topping", "topping", 6, (c) => ({ remedy: "remake", amount: 0, ageDays: between(1, 60),
    complaint: `${c.name} opened the box and found ${c.topping}; the ticket says otherwise.` })],
  ["late", "delay", 4, (c) => ({ remedy: "credit", amount: lateCredit(c.orderValue), ageDays: between(1, 60),
    complaint: `${c.name} watched the driver pull up ${c.minutes} minutes past the promised slot.` })],
  ["cold", "chilled", 4, (c) => ({ remedy: "remake", amount: 0, ageDays: between(1, 60),
    complaint: `The pizza reached ${c.name} stone cold and they want it fixed.` })],
  ["missing-item", "shortbag", 6, (c, variant) => {
    const stale = variant % 2 === 0;
    return { remedy: stale ? "credit" : "refund",
      amount: stale ? Math.min(c.itemPrice, 15) : itemRefund(c.itemPrice, c.orderValue),
      ageDays: stale ? between(32, 75) : between(1, 25),
      complaint: stale
        ? `${c.name} says a ${c.item} never made the bag on an order placed over a month ago.`
        : `${c.name} paid for a ${c.item} that never made the bag.` };
  }],
  ["customer-address", "misroute", 4, (c) => ({ remedy: "credit", amount: 5, ageDays: between(1, 60),
    complaint: `${c.name} typed ${c.street} into the address field and the courier came back.` })],
  ["allergen", "allergy", 6, (c) => ({ remedy: "escalate", amount: 0, ageDays: between(1, 60),
    complaint: `${c.name} reports ${c.topping} on a pie labelled allergen-free.` })],
  ["angry-repeat", "repeat", 4, (c) => ({ remedy: "credit", amount: lateCredit(c.orderValue), ageDays: between(1, 60),
    complaint: `${c.name} is furious: a second order this month showed up late.` })],
  ["fraud-pattern", "flagged", 6, (c) => ({ remedy: "escalate", amount: 0, ageDays: between(1, 60),
    complaint: `${c.name}'s account flags repeat refund claims, three this week alone.` })],
];

const pool = pools[split];
const table = split === "public" ? publicScenarios : hiddenScenarios;

// The hidden split shifts the scenario mix with the seed so its structure differs
// from the public split beyond the template wording.
const counts = table.map((row) => row[2]);
if (split === "hidden") {
  for (let n = 0; n < 4; n++) {
    const from = Math.floor(random() * counts.length);
    const to = Math.floor(random() * counts.length);
    if (from !== to && counts[from] > 3) { counts[from]--; counts[to]++; }
  }
}

const tasks = [];
for (let index = 0; index < table.length; index++) {
  const [key, alias, , draw] = table[index];
  for (let variant = 1; variant <= counts[index]; variant++) {
    const orderId = `PZ-${between(100000, 999999)}`;
    const itemPrice = pool.itemPrice();
    const orderValue = itemPrice + pool.orderBase();
    const context = { name: pick(pool.names), topping: pick(pool.toppings), street: pick(pool.streets), minutes: pool.minutes(), item: pick(pool.items), itemPrice, orderValue };
    const drawn = draw(context, variant);
    tasks.push({
      id: `${split === "hidden" ? "hz-" : ""}${alias}-${variant}`,
      kind: "episode",
      prompt: `Order ${orderId}. ${drawn.complaint} ${instruction[split]}`,
      input: { scenario: key, orderId, customer: context.name, orderValue, ageDays: drawn.ageDays, affectedItem: context.item, affectedItemPrice: itemPrice },
      expected: { remedy: drawn.remedy, amount: drawn.amount },
      metadata: { seed, split, scenario: key, variant },
    });
  }
}

if (split === "hidden") {
  for (let index = tasks.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [tasks[index], tasks[swap]] = [tasks[swap], tasks[index]];
  }
}

const output = option("--output", split === "public" ? "data/tasks.jsonl" : `hidden/tasks-${seed}.jsonl`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${tasks.map((task) => JSON.stringify(task)).join("\n")}\n`);
console.log(`generated ${tasks.length} ${split} tasks with seed ${seed} in ${output}`);
