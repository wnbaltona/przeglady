/* Systemowy przycisk Wstecz: zamykanie okien i powrót między widokami. */
(() => {
  const media = window.matchMedia("(max-width: 800px)");
  const closeButtons = {
    editModal: "cancel",
    localModal: "cancelLocal",
    typesModal: "closeTypes",
    trashModal: "closeTrash",
    historyModal: "closeHistory",
    themeModal: "closeTheme",
    loginModal: "closeLogin",
    attentionModal: "closeAttention",
    recordDetailModal: "closeRecordDetail",
    accountModal: "closeAccount",
  };
  const marker = "inspectionNavigation";
  let initialized = false,
    applying = false,
    removingEntry = false;
  let last,
    sequence = 0;
  const openedAt = new Map();
  const trail = [];
  const page = () => document.body.dataset.workspace || "dashboard";
  const overlays = () => {
    const ids = [
      ...document.querySelectorAll(".modal.open:not(.workspace-view)"),
    ]
      .filter((element) => !element.hidden)
      .map((element) => element.id);
    const menu = document.getElementById("userMenu");
    if (media.matches && menu && !menu.hidden) ids.push("userMenu");
    for (const id of ids) if (!openedAt.has(id)) openedAt.set(id, ++sequence);
    for (const id of openedAt.keys())
      if (!ids.includes(id)) openedAt.delete(id);
    return ids.sort((a, b) => openedAt.get(a) - openedAt.get(b));
  };
  const snapshot = () => ({ page: page(), overlays: overlays() });
  const state = (value) => ({ ...history.state, [marker]: value });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function close(id) {
    if (id === "userMenu") {
      document.getElementById("menuClose")?.click();
      return;
    }
    const button = document.getElementById(closeButtons[id]);
    if (button) button.click();
    else document.getElementById(id)?.classList.remove("open");
  }
  function sync() {
    if (document.body.classList.contains("auth-screen")) {
      initialized = false;
      applying = false;
      removingEntry = false;
      trail.length = 0;
      openedAt.clear();
      last = undefined;
      history.replaceState({ ...history.state, [marker]: null }, "");
      return;
    }
    if (!media.matches || applying || removingEntry) return;
    const current = snapshot();
    if (!initialized) {
      initialized = true;
      last = { page: current.page, overlays: [] };
      trail.push(last);
      history.replaceState(state(last), "");
    }
    if (same(current, last)) return;
    // Zamknięcie przez X lub tło usuwa także wpis okna z historii.
    if (
      current.page === last.page &&
      current.overlays.length < last.overlays.length
    ) {
      removingEntry = true;
      last = current;
      history.back();
      return;
    }
    // Przejście z jednego okna do drugiego nie zostawia pustego kroku.
    const replacingWindow =
      current.page === last.page &&
      current.overlays.length === last.overlays.length &&
      current.overlays.length > 0;
    last = current;
    if (replacingWindow) {
      trail[trail.length - 1] = current;
      history.replaceState(state(current), "");
    } else {
      trail.push(current);
      history.pushState(state(current), "");
    }
  }
  window.addEventListener("popstate", (event) => {
    if (document.body.classList.contains("auth-screen")) return;
    // Niektóre przeglądarki osadzone zwracają null w popstate.
    const target = event.state?.[marker] || trail[trail.length - 2];
    if (!initialized || !target) return;
    if (trail.length > 1) trail.pop();
    applying = true;
    if (!removingEntry) {
      for (const id of overlays().reverse()) {
        if (!target.overlays.includes(id)) close(id);
      }
      if (page() !== target.page) window.openWorkspace?.(target.page, false);
      // Obsługa zamknięcia formularza może przywrócić wcześniejsze okno.
      for (const id of overlays().reverse()) {
        if (!target.overlays.includes(id)) close(id);
      }
    }
    queueMicrotask(() => {
      last = snapshot();
      trail[trail.length - 1] = last;
      history.replaceState(state(last), "");
      removingEntry = false;
      applying = false;
    });
  });
  new MutationObserver(sync).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "data-workspace"],
  });
  media.addEventListener("change", sync);
  sync();
})();
