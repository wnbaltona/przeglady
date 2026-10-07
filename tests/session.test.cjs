const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
function classList(...initial) {
  const values = new Set(initial);
  return {
    add: (value) => values.add(value),
    remove: (value) => values.delete(value),
    contains: (value) => values.has(value),
    toggle(value, active) {
      active ? values.add(value) : values.delete(value);
    },
  };
}
async function run() {
  const nodes = {};
  const node = (id) =>
    (nodes[id] ||= {
      textContent: "",
      disabled: false,
      classList: classList(),
      setAttribute() {},
      focus() {},
      elements: { password: { value: "secret" } },
      reset() {
        this.elements.password.value = "";
      },
    });
  const openModal = { id: "editModal", classList: classList("open") };
  let signedOut = false,
    rejectLogout = false,
    clearCount = 0,
    toastMessage = "";
  const context = vm.createContext({
    $: node,
    document: {
      body: { classList: classList() },
      querySelectorAll: () => [openModal],
    },
    window: {},
    activeSession: { user: { id: "test" } },
    sessionVersion: 1,
    logoutPending: false,
    inactivityTimer: null,
    data: [{ id: "private" }],
    locations: [{}],
    inspectionTypes: ["Klimatyzacja"],
    editing: {},
    returnToCalendar: true,
    closeUserMenu() {},
    render() {},
    clearTimeout() {},
    updatePushButton() {},
    clearActivity() {
      clearCount++;
    },
    showToast(message) {
      toastMessage = message;
    },
    sb: {
      auth: {
        async signOut() {
          if (rejectLogout) return { error: new Error("Connection failed") };
          signedOut = true;
          return { error: null };
        },
      },
    },
  });
  vm.runInContext(
    source.slice(
      source.indexOf("async function applySession("),
      source.indexOf("async function start()"),
    ),
    context,
  );
  vm.runInContext(
    source.slice(
      source.indexOf('$("#logout").onclick ='),
      source.indexOf('$("#add").onclick ='),
    ),
    context,
  );

  rejectLogout = true;
  await node("#logout").onclick();
  assert.equal(context.activeSession.user.id, "test");
  assert.equal(context.data.length, 1);
  assert.equal(clearCount, 0);
  assert.equal(node("#headerLogout").disabled, false);
  assert.match(toastMessage, /Nie udało/);

  rejectLogout = false;
  await Promise.all([node("#logout").onclick(), node("#logout").onclick()]);
  assert.equal(signedOut, true);
  assert.equal(clearCount, 1);
  assert.equal(context.activeSession, null);
  assert.equal(context.data.length, 0);
  assert.equal(context.locations.length, 0);
  assert.equal(context.document.body.classList.contains("auth-screen"), true);
  assert.equal(openModal.classList.contains("open"), false);
  assert.equal(node("#loginModal").classList.contains("open"), true);
  assert.equal(node("#loginForm").elements.password.value, "");
  assert.equal(context.logoutPending, false);
  // Odpowiedź rozpoczętego wcześniej pobierania nie przywraca danych po wylogowaniu.
  context.activeSession = { user: { id: "test" } };
  const pendingQueries = [];
  context.sb.from = () => {
    const query = {
      select: () => query,
      is: () => query,
      order: () => query,
      eq: () => query,
      maybeSingle: () => query,
      then(resolve) {
        pendingQueries.push(resolve);
      },
    };
    return query;
  };
  vm.runInContext(
    source.slice(
      source.indexOf("async function load()"),
      source.indexOf("// Powiadomienia push"),
    ),
    context,
  );
  const pendingLoad = context.load();
  await Promise.resolve();
  await context.applySession(null);
  pendingQueries.forEach((resolve) =>
    resolve({ data: [{ id: "old-record" }], error: null }),
  );
  await pendingLoad;
  assert.equal(context.data.length, 0);
  console.log(
    "OK: wylogowanie, błąd połączenia, podwójne kliknięcie i czyszczenie widoku.",
  );
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
