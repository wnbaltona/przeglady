const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../ux.js"), "utf8");
const submit = {
  tagName: "BUTTON",
  type: "submit",
  textContent: "Zapisz",
  disabled: false,
  dataset: {},
};
const close = {
  tagName: "BUTTON",
  type: "button",
  disabled: false,
  dataset: {},
};
const lockedField = { tagName: "INPUT", disabled: true, dataset: {} };
let feedback,
  focusCount = 0;
const form = {
  attributes: {},
  setAttribute(key, value) {
    this.attributes[key] = value;
  },
  querySelector: (selector) => (selector === ".form-feedback" ? feedback : {}),
  querySelectorAll: () => [submit, close, lockedField],
  insertBefore(element) {
    feedback = element;
  },
};
const context = vm.createContext({
  document: {
    createElement: () => ({
      setAttribute() {},
      focus() {
        focusCount++;
      },
      scrollIntoView() {},
    }),
  },
});
vm.runInContext(source.slice(0, source.indexOf("(() => {")), context);
context.setFormBusy(form, true);
assert.equal(form.attributes["aria-busy"], "true");
assert.equal(submit.textContent, "Zapisywanie…");
assert.equal(close.disabled, true);
context.setFormBusy(form, false);
assert.equal(submit.textContent, "Zapisz");
assert.equal(close.disabled, false);
assert.equal(lockedField.disabled, true);
context.setFormFeedback(form, "Nie udało się zapisać");
assert.equal(feedback.hidden, false);
assert.equal(focusCount, 1);
context.setFormFeedback(form);
assert.equal(feedback.hidden, true);
console.log("OK: stan zapisu, przywracanie kontrolek i komunikaty formularza.");
