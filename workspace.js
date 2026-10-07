/* Nawigacja i widoki panelu. Operacje zapisu pozostają w app.js. */
(() => {
  const icons = {
    dashboard: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
    locations:
      '<path d="M4 21V5l8-2 8 2v16M2 21h20M8 8h2M14 8h2M8 12h2M14 12h2M10 21v-5h4v5"/>',
    inspections:
      '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M7 18h2"/>',
    attention:
      '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6"/>',
    settings:
      '<path d="M9.5 3h5l.6 2.4 2 .9 2.2-.7 2.5 4.3-1.6 1.8v2.3l1.6 1.8-2.5 4.3-2.2-.7-2 .9-.6 2.4h-5l-.6-2.4-2-.9-2.2.7-2.5-4.3 1.6-1.8v-2.3L2.2 9.9l2.5-4.3 2.2.7 2-.9z"/><circle cx="12" cy="12.5" r="3"/>',
  };
  const labels = {
    dashboard: "Pulpit",
    locations: "Lokale",
    inspections: "Przeglądy",
    calendar: "Terminy",
    attention: "Alerty",
    settings: "Ustawienia",
  };
  const navButton = (key) =>
    `<button type="button" data-workspace-view="${key}" aria-label="${labels[key]}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg><span>${labels[key]}</span></button>`;
  $("#workspaceNav").innerHTML = Object.keys(labels)
    .filter((key) => key !== "attention")
    .map(navButton)
    .join("");
  const menuViews = document.createElement("div");
  menuViews.className = "mobile-workspace-links";
  menuViews.innerHTML = ["locations", "inspections", "settings"]
    .map(navButton)
    .join("");
  $("#userMenu").insertBefore(menuViews, $("#userMenu").children[1]);

  const views = {
    dashboard: $("#dashboardView"),
    inspections: $("#registerView"),
    locations: $("#locationsModal"),
    calendar: $("#calendarModal"),
    settings: $("#settingsView"),
  };
  for (const key of ["locations", "calendar"]) {
    const panel = views[key];
    panel.classList.remove("modal");
    panel.classList.add("workspace-view");
    panel.hidden = true;
    $(".wrap").append(panel);
    panel.querySelector(".modal-close").hidden = true;
  }
  $("#registerView").insertBefore($("#registerFilters"), $("#registerTable"));
  $("#locationSearch").addEventListener("input", renderLocationList);
  const search = $("#search");
  search.placeholder = "Szukaj lokalu, miasta lub przeglądu…";
  const searchBox = document.createElement("div");
  searchBox.className = "workspace-search";
  searchBox.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg>';
  searchBox.append(search);
  $(".top").insertBefore(searchBox, $(".top .actions"));
  $("#registerFilters .search-row").remove();
  $(".top h1").textContent = "Pulpit";
  $(".top p").textContent = "Rejestr przeglądów";
  const filters = $("#registerFilters .filter-row");
  const statusSelect = document.createElement("select");
  statusSelect.id = "workspaceStatus";
  statusSelect.setAttribute("aria-label", "Filtr statusu");
  statusSelect.innerHTML =
    '<option value="">Wszystkie statusy</option><option value="PO TERMINIE">Po terminie</option><option value="DO WYKONANIA">Do wykonania</option><option value="OK">Aktualne</option>';
  filters.insertBefore(statusSelect, $("#filterCount"));
  filters.append($("#export"));
  $("#registerFilters .tools").remove();
  statusSelect.addEventListener("change", () => {
    window.activeStatus = statusSelect.value;
    setAttentionFilter(false);
    render();
  });
  search.addEventListener("input", () => openWorkspace("inspections", false));

  window.openWorkspace = openWorkspace;
  function openWorkspace(key, focus = true) {
    if (key === "attention") {
      closeUserMenu();
      openAttentionTable();
      return;
    }
    if (!views[key]) return;
    $("#attentionModal").classList.remove("open");
    closeUserMenu();
    for (const [name, panel] of Object.entries(views)) {
      panel.hidden = name !== key;
      if (panel.classList.contains("workspace-view"))
        panel.classList.toggle("open", name === key);
    }
    document.body.dataset.workspace = key;
    $(".top h1").textContent = labels[key];
    document.querySelectorAll("[data-workspace-view]").forEach((button) => {
      if (button.dataset.workspaceView === key)
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (key === "calendar") renderCalendar();
    if (key === "locations") renderLocationList();
    if (key === "settings") updateAccount();
    updateMobileNavigation();
    if (focus) {
      window.scrollTo({ top: 0 });
      const heading = views[key].querySelector("h2");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
    }
  }
  // Istniejące przyciski i powiadomienia mogą nadal otwierać widoki przez klasę open.
  const viewObserver = new MutationObserver(() => {
    for (const key of ["calendar", "locations"]) {
      if (views[key].hidden && views[key].classList.contains("open")) {
        openWorkspace(key);
        break;
      }
    }
  });
  for (const key of ["calendar", "locations"])
    viewObserver.observe(views[key], {
      attributes: true,
      attributeFilter: ["class"],
    });
  $("#closeCalendar").onclick = () => openWorkspace("dashboard");
  $("#closeLocations").onclick = () => openWorkspace("dashboard");
  $("#attentionShowAll").addEventListener("click", () =>
    openWorkspace("inspections"),
  );
  $(".workspace-brand").onclick = (event) => {
    event.preventDefault();
    openWorkspace("dashboard");
  };
  $(".mobile-app-logo").onclick = $(".workspace-brand").onclick;

  let selectedRecord = null;
  const detailModal = $("#recordDetailModal");
  $("#closeRecordDetail").onclick = () => {
    detailModal.classList.remove("open");
    selectedRecord = null;
  };
  detailModal.addEventListener("click", (event) => {
    if (event.target === detailModal) $("#closeRecordDetail").click();
  });
  detailModal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") $("#closeRecordDetail").click();
  });
  function showRecord(id) {
    const record = data.find((row) => String(row.id) === String(id));
    if (!record) return;
    selectedRecord = record.id;
    $("#recordDetailContent").innerHTML =
      `<span class="eyebrow">Szczegóły przeglądu</span><h2>${esc(record.type)}</h2><p class="record-address">${esc(record.city)} · <strong>${esc(record.local)}</strong></p>${mobileInspectionCard(record)}`;
    $("#attentionModal").classList.remove("open");
    detailModal.classList.add("open");
    $("#closeRecordDetail").focus();
  }
  document.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-workspace-view]");
    if (viewButton) {
      openWorkspace(viewButton.dataset.workspaceView);
      return;
    }
    const forward = event.target.closest("[data-forward]");
    if (forward) {
      document.getElementById(forward.dataset.forward)?.click();
      return;
    }
    const metric = event.target.closest("[data-workspace-status]");
    if (metric) {
      if (!metric.closest("#registerStatusFilters")) {
        $("#search").value = "";
        $("#city").value = "";
        $("#protocol").value = "";
      }
      window.activeStatus = metric.dataset.workspaceStatus;
      setAttentionFilter(false);
      render();
      openWorkspace("inspections");
      return;
    }
    const record = event.target.closest("[data-record-detail]");
    if (record) {
      showRecord(record.dataset.recordDetail);
      return;
    }
    const action = event.target.closest("#recordDetailContent [data-action]");
    if (!action) return;
    const id = action.dataset.id;
    if (action.dataset.action === "open") {
      await openFile(id);
      return;
    }
    if (action.dataset.action === "history") {
      $("#closeRecordDetail").click();
      await showHistory(id);
      return;
    }
    $("#closeRecordDetail").click();
    if (action.dataset.action === "edit") await editRow(id);
    if (action.dataset.action === "delete") await deleteRow(id);
  });
  document.addEventListener("keydown", (event) => {
    const row = event.target.closest("[data-record-detail]");
    if (row && event.target === row && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      showRecord(row.dataset.recordDetail);
    }
  });
  function recordRow(record) {
    const expiry = nextDate(record.done, record.months);
    return `<tr data-record-detail="${esc(record.id)}" tabindex="0" aria-label="Szczegóły: ${esc(record.local)} — ${esc(record.type)}"><td data-label="Lokal"><b>${esc(record.local)}</b><small>${esc(record.city)}</small></td><td data-label="Rodzaj">${esc(record.type)}</td><td data-label="Wykonano">${fmt(record.done)}</td><td data-label="Następny termin">${fmt(expiry)}</td><td data-label="Status"><span class="badge ${statusClass(record)}">${statusLabel(record)}</span></td><td data-label="Protokół"><span class="badge ${protocol(record) === "DODANY" ? "OK" : "BRAK"}">${protocol(record) === "DODANY" ? "Dodany" : "Brak"}</span></td><td class="record-open"><span aria-hidden="true">›</span></td></tr>`;
  }
  function recordTable(records) {
    const headers = [
      "Lokal / miasto",
      "Rodzaj przeglądu",
      "Wykonano",
      "Następny termin",
      "Status",
      "Protokół",
    ]
      .map((label) => `<th>${label}</th>`)
      .join("");
    return records.length
      ? `<div class="workspace-tablebox"><table class="workspace-table"><thead><tr>${headers}<th><span class="sr-only">Szczegóły</span></th></tr></thead><tbody>${records.map(recordRow).join("")}</tbody></table></div>`
      : '<div class="workspace-empty">Brak przeglądów do wyświetlenia.</div>';
  }
  function updateAccount() {
    $("#workspaceUser").textContent = $("#user").textContent;
    $("#workspaceLogout").hidden = $("#logout").hidden;
    $("#workspacePush").hidden = $("#pushToggle").hidden;
    $("#workspacePush").firstChild.textContent =
      $("#pushToggle").textContent.trim() + " ";
  }
  window.renderWorkspace = (shown) => {
    const records = shown || data;
    statusSelect.value = window.activeStatus || "";
    const urgent = attentionRows();
    const dueCount = data.filter((row) => state(row) === "DO WYKONANIA").length;
    const currentCount = data.filter((row) => state(row) === "OK").length;
    $("#registerOverdueCount").textContent = data.filter(
      (row) => state(row) === "PO TERMINIE",
    ).length;
    $("#registerAllCount").textContent = data.length;
    $("#registerDueCount").textContent = dueCount;
    $("#registerCurrentCount").textContent = currentCount;
    document
      .querySelectorAll("#registerStatusFilters [data-workspace-status]")
      .forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(
            button.dataset.workspaceStatus === (window.activeStatus || ""),
          ),
        );
      });
    $("#dashboardMetrics").innerHTML =
      `<button class="dashboard-metric metric-overdue" data-workspace-status="PO TERMINIE"><span>Po terminie</span><b>${data.filter((row) => state(row) === "PO TERMINIE").length}</b></button><button class="dashboard-metric metric-due" data-workspace-status="DO WYKONANIA"><span>Do wykonania</span><b>${dueCount}</b></button><button class="dashboard-metric metric-current" data-workspace-status="OK"><span>Aktualne</span><b>${currentCount}</b></button><button class="dashboard-metric" data-workspace-status=""><span>Wszystkie wpisy</span><b>${data.length}</b></button>`;
    $("#dashboardUrgent").innerHTML = recordTable(urgent.slice(0, 8));
    $("#registerResultCount").textContent =
      `${records.length} z ${data.length} przeglądów`;
    if ($("#attentionModal").classList.contains("open")) renderAttentionTable();
    if (document.body.dataset.workspace === "calendar") renderCalendar();
    if (document.body.dataset.workspace === "locations") renderLocationList();
    updateAccount();
    if (selectedRecord && !data.some((row) => row.id === selectedRecord))
      $("#closeRecordDetail").click();
  };
  new MutationObserver(updateAccount).observe($("#userMenu"), {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  render();
  openWorkspace("dashboard", false);
  if (window.activeAttention) openWorkspace("attention", false);
})();
