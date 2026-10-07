const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fixedToday = new Date(2026, 9, 7, 12);
class TestDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [fixedToday.getTime()]));
  }
}
const context = vm.createContext({ Date: TestDate });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../inspection-utils.js"), "utf8"),
  context,
);

assert.equal(context.nextDate("2024-01-31", 1), "2024-02-29");
assert.equal(context.nextDate("2025-01-31", 1), "2025-02-28");
assert.equal(context.nextDate("2025-12-15", 2), "2026-02-15");
assert.equal(context.nextDate("", 12), "");
assert.equal(context.nextDate("2026-01-01", -1), "");

for (const [done, days, state, css, attention] of [
  ["2025-10-06", -1, "PO TERMINIE", "POBLACK", true],
  ["2025-10-07", 0, "DO WYKONANIA", "DO14", true],
  ["2025-10-21", 14, "DO WYKONANIA", "DO14", true],
  ["2025-10-22", 15, "DO WYKONANIA", "DO30", false],
  ["2025-11-06", 30, "DO WYKONANIA", "DO30", false],
  ["2025-11-07", 31, "OK", "OK", false],
]) {
  const record = { done, months: 12 };
  assert.equal(context.daysUntilExpiry(record), days);
  assert.equal(context.state(record), state);
  assert.equal(context.statusClass(record), css);
  assert.equal(context.requiresAttention(record), attention);
}
assert.equal(context.statusLabel({ done: "", months: 12 }), "—");
assert.equal(
  context.statusLabel({ done: "2025-10-06", months: 12 }),
  "Po terminie (1 dzień)",
);
assert.equal(context.protocol({ protocolDate: "2026-10-07" }), "DODANY");
assert.equal(context.protocol({}), "BRAK PROTOKOŁU");
assert.equal(context.countLabel(1), "1 przegląd");
assert.equal(context.countLabel(12), "12 przeglądów");
assert.equal(context.countLabel(22), "22 przeglądy");
console.log("OK: daty, granice statusów, protokoły i etykiety.");
