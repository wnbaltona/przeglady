const $ = (s) => document.querySelector(s),
  config = window.APP_CONFIG || {},
  ready = Boolean(config.supabaseUrl && config.supabaseAnonKey);
// Konfiguracja i sesja
const safeStorage = (() => {
  try {
    localStorage.setItem("__test", "1");
    localStorage.removeItem("__test");
    return localStorage;
  } catch {
    const s = {};
    return {
      getItem: (k) => s[k] || null,
      setItem: (k, v) => (s[k] = String(v)),
      removeItem: (k) => delete s[k],
    };
  }
})();
const sb = ready
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: safeStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
const INACTIVITY_HOURS = Math.max(1, Number(config.inactivityHours) || 24);
const INACTIVITY_LIMIT_MS = INACTIVITY_HOURS * 60 * 60 * 1000;
const ACTIVITY_STORAGE_PREFIX = "przeglady:last-activity:";
const ACTIVITY_WRITE_INTERVAL_MS = 60 * 1000;
const PUSH_PUBLIC_KEY = String(config.pushVapidPublicKey || "").trim();
let activeSession = null,
  inactivityTimer = null,
  inactivityLogoutInProgress = false,
  lastActivityWrite = 0;
let sessionVersion = 0;
let logoutPending = false;
let data = [],
  inspectionTypes = [],
  locations = [],
  typeCatalogAvailable = false,
  editing = null,
  editingVersion = null,
  themeOpenedFromLogin = false,
  editingType = null;

/* Sortowanie tabel */
let tableSortKey = "nextDate";
let tableSortDirection = "asc";
const MAX_PROTOCOL_SIZE = 10 * 1024 * 1024,
  ALLOWED_PROTOCOL_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]);
// Słownik domyślnych rodzajów
const fallbackTypes = [
  "Elektryczny (roczny)",
  "Elektryczny (5-cio letni)",
  "Systemy PPOŻ",
  "Gaśnice",
  "Klimatyzacja",
  "Alarmy",
  "Hydranty",
  "Rolety",
  "Wentylacja",
  "Wymiana filtrów",
  "Regałów magazynowych",
  "CRO",
  "Mroźnia/Chłodnia",
  "Regały chłodnicze",
  "Separatory tłuszczu",
  "Vendingi",
  "UDT (wózki widłowe, paleciaki)",
  "BHP (drabiny, schodki, podesty)",
  "Ansul",
  "Okap",
  "Brama garażowa",
  "Żaluzje (gastro)",
  "Bramki antykradzieżowe",
  "Klamki na kod",
  "Oświetlenie",
  "Drzwi przeciwpożarowe",
  "Drzwi na zaplecze",
  "Systemy multmedialne",
  "Posadzki, wykładziny",
  "Kontrola kurzu",
  "Light boxy",
  "Floorboxy",
  "Meble",
  "Szyby",
  "Lampy owadobójcze",
  "Samochody",
  "Windy w samochodach",
  "Mycie jednostek klimatyzacji",
  "Sprawdzenie pompy odpływowej",
];
const monthsByType = {
  "elektryczny (5-cio letni)": 60,
  "elektryczny (roczny)": 12,
  klimatyzacja: 3,
  "mycie jednostek klimatyzacji": 36,
  wentylacja: 12,
  rolety: 12,
  "rolety sklepowe": 12,
  gasnice: 12,
  oswietlenie: 1,
  "sprawdzenie pompy odplywowej": 2,
};
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>\"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const iso = (v) => (v ? String(v).slice(0, 10) : "");
const fmt = (v) =>
  v ? new Date(v + "T12:00:00").toLocaleDateString("pl-PL") : "—";
const norm = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const searchNorm = (value) => norm(value).replace(/ł/g, "l");
let restoredViewKey = "",
  savedView = null,
  formScroll = null,
  toastTimer;
const viewKey = () => `przeglady:view:${activeSession?.user?.id || "guest"}`;
function rememberView() {
  if (!data.length || restoredViewKey !== viewKey()) return;
  const opened = (selector, key) =>
    [...document.querySelectorAll(selector)].map(key);
  savedView = {
    search: $("#search").value,
    city: $("#city").value,
    protocol: $("#protocol").value,
    status: window.activeStatus || "",
    sort: tableSortKey,
    direction: tableSortDirection,
    cities: opened("#cityGroups .city-group[open]", (x) => x.dataset.city),
    locals: opened(
      "#cityGroups .local-inspections.open",
      (x) => `${x.dataset.city}|||${x.dataset.local}`,
    ),
    types: opened(
      "#cityGroups .inspection-type-group[open]",
      (x) => x.dataset.typeKey,
    ),
  };
  try {
    sessionStorage.setItem(viewKey(), JSON.stringify(savedView));
  } catch {}
}
function restoreView() {
  if (!data.length || restoredViewKey === viewKey()) return false;
  restoredViewKey = viewKey();
  try {
    savedView = JSON.parse(sessionStorage.getItem(viewKey()) || "null");
  } catch {
    savedView = null;
  }
  if (!savedView) return false;
  $("#search").value = savedView.search || "";
  $("#city").value = savedView.city || "";
  $("#protocol").value = savedView.protocol || "";
  window.activeStatus = savedView.status || "";
  tableSortKey = [
    "type",
    "done",
    "nextDate",
    "status",
    "protocol",
    "notes",
  ].includes(savedView.sort)
    ? savedView.sort
    : "nextDate";
  tableSortDirection = savedView.direction === "desc" ? "desc" : "asc";
  return true;
}
for (const event of ["input", "change", "click", "toggle"]) {
  document.addEventListener(
    event,
    (e) => {
      if (
        e.target.closest(
          "#cityGroups, #registerFilters, #registerStatusFilters, #dashboardMetrics, .workspace-search",
        )
      )
        setTimeout(rememberView, 0);
    },
    true,
  );
}
function showToast(message) {
  let toast = $("#appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3500);
}
function restoreFormScroll() {
  if (!formScroll) return;
  const position = formScroll;
  formScroll = null;
  requestAnimationFrame(() => {
    window.scrollTo(position.x, position.y);
    for (const item of position.panels) {
      const panel = document.getElementById(item.id);
      if (panel) panel.scrollTop = item.top;
    }
  });
}
// Mapowanie rekordów Supabase
const fromDb = (r) => ({
  id: r.id,
  city: r.city,
  local: r.local,
  type: r.type,
  done: iso(r.done),
  months: r.months,
  protocolDate: iso(r.protocol_date),
  protocolFileName: r.protocol_file_name,
  protocolPath: r.protocol_path,
  notes: r.notes || "",
  version: r.version,
  deletedAt: r.deleted_at,
});
const toDb = (r) => ({
  id: r.id,
  city: r.city.trim(),
  local: r.local.trim(),
  type: r.type.trim(),
  done: r.done || null,
  months: Number(r.months),
  protocol_date: r.protocolDate || null,
  protocol_file_name: r.protocolFileName || null,
  protocol_path: r.protocolPath || null,
  notes: r.notes || "",
});
let calendarMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ),
  calendarSelectedDate = "",
  returnToCalendar = false;
window.activeAttention =
  new URLSearchParams(window.location.search).get("filter") === "attention";
function setAttentionFilter(active) {
  window.activeAttention = Boolean(active);
  const url = new URL(window.location.href);
  if (active) url.searchParams.set("filter", "attention");
  else if (url.searchParams.get("filter") === "attention")
    url.searchParams.delete("filter");
  try {
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {}
}
// Sortowanie rejestru
function sortValue(r, key) {
  switch (key) {
    case "local":
      return String(r.local || "");

    case "type":
      return String(r.type || "");

    case "done":
      return r.done || "";

    case "nextDate":
      return nextDate(r.done, r.months) || "";

    case "status":
      return state(r) || "";

    case "protocol":
      return protocol(r) || "";

    case "notes":
      return String(r.notes || "");

    default:
      return "";
  }
}

function compareRows(a, b, key, direction) {
  const valueA = sortValue(a, key);
  const valueB = sortValue(b, key);

  /* Puste wartości zawsze na końcu */
  if (!valueA && !valueB) return 0;
  if (!valueA) return 1;
  if (!valueB) return -1;

  let result;
  if (key === "done" || key === "nextDate") {
    result = String(valueA).localeCompare(String(valueB), "en");
  } else if (key === "status") {
    const rank = { POBLACK: 0, DO14: 1, DO30: 2, OK: 3 };
    const rankA = rank[statusClass(a)] ?? 99,
      rankB = rank[statusClass(b)] ?? 99;
    result = rankA - rankB;
  } else if (key === "local") {
    const numberA = Number.parseInt(
        String(valueA).match(/^\s*\d+/)?.[0] || "",
        10,
      ),
      numberB = Number.parseInt(String(valueB).match(/^\s*\d+/)?.[0] || "", 10);
    if (
      Number.isFinite(numberA) &&
      Number.isFinite(numberB) &&
      numberA !== numberB
    )
      result = numberA - numberB;
    else
      result = String(valueA).localeCompare(String(valueB), "pl", {
        numeric: true,
        sensitivity: "base",
      });
  } else {
    result = String(valueA).localeCompare(String(valueB), "pl", {
      numeric: true,
      sensitivity: "base",
    });
  }
  if (result === 0 && key !== "type")
    result = String(a.type || "").localeCompare(String(b.type || ""), "pl", {
      sensitivity: "base",
    });
  return direction === "desc" ? -result : result;
}

function sortRows(records) {
  if (!tableSortKey) {
    return [...records];
  }

  return [...records].sort((a, b) =>
    compareRows(a, b, tableSortKey, tableSortDirection),
  );
}

function tableHeaders() {
  const headers = [
    ["type", "Rodzaj"],
    ["done", "Wykonano"],
    ["nextDate", "Następny termin"],
    ["status", "Status"],
    ["protocol", "Protokół"],
  ];

  return (
    headers
      .map(([key, label]) => {
        const active = tableSortKey === key;
        const direction = active ? tableSortDirection : "";

        return `
            <th
                class="sortable ${active ? "active " + direction : ""}"
                data-sort-key="${key}"
                title="Kliknij, aby posortować"
            >
                <span class="sort-header">
                    ${label}
                    <span class="sort-arrow"></span>
                </span>
            </th>
        `;
      })
      .join("") +
    `
        <th>Uwagi</th>
        <th>Akcje</th>
    `
  );
}

function tableColumns() {
  return `
        <colgroup>
            <col class="col-type">
            <col class="col-done">
            <col class="col-next">
            <col class="col-status">
            <col class="col-protocol">
            <col class="col-notes">
            <col class="col-actions">
        </colgroup>
    `;
}
function refreshLists() {
  const selected = $("#city").value,
    types = typeCatalogAvailable ? inspectionTypes : fallbackTypes,
    cities = [
      ...new Set(
        [...data.map((x) => x.city), ...locations.map((x) => x.city)]
          .map((x) => String(x || "").trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "pl"));
  $("#city").innerHTML =
    '<option value="">Wszystkie miasta</option>' +
    cities.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
  $("#city").value = selected;
  $("#cities").innerHTML = cities
    .map((x) => `<option value="${esc(x)}">`)
    .join("");
  $("#types").innerHTML = [...new Set(types)]
    .sort((a, b) => a.localeCompare(b, "pl"))
    .map((x) => `<option value="${esc(x)}">`)
    .join("");
}
function refreshLocals() {
  const city = norm($("#editForm").elements.city.value),
    source = [
      ...locations,
      ...data.map((r) => ({ city: r.city, local: r.local })),
    ],
    names = [
      ...new Set(
        source
          .filter((r) => !city || norm(r.city) === city)
          .map((r) => String(r.local || "").trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "pl"));
  $("#locals").innerHTML = names
    .map((x) => `<option value="${esc(x)}">`)
    .join("");
}
// Wiersze i karty przeglądów
function rows(records) {
  return records
    .map((r) => {
      const s = state(r),
        p = protocol(r);
      return `<tr><td>${esc(r.type)}</td><td>${fmt(r.done)}</td><td>${fmt(nextDate(r.done, r.months))}</td><td class="status-cell">
    <span class="badge ${statusClass(r)}">
        ${statusLabel(r)}
    </span>
</td><td class="protocol-cell"><span class="badge ${p === "DODANY" ? "OK" : "BRAK"}">${p === "DODANY" ? "DODANY" : "BRAK"}</span>${r.protocolPath ? ` <button type="button" class="open-file" data-action="open" data-id="${esc(r.id)}">Otwórz</button>` : ""}</td><td>${esc(r.notes)}</td><td><div class="row-actions">
    <button type="button" class="secondary action-edit" data-action="edit" data-id="${esc(r.id)}" title="Edytuj" aria-label="Edytuj">
        <span>Edytuj</span>
    </button>
    <button type="button" class="danger action-delete" data-action="delete" data-id="${esc(r.id)}" title="Usuń" aria-label="Usuń">
        <span>Usuń</span>
    </button>
    <button type="button" class="secondary action-history" data-action="history" data-id="${esc(r.id)}" title="Historia" aria-label="Historia">
        <span>Historia</span>
    </button>
</div></td></tr>`;
    })
    .join("");
}

function mobileInspectionCard(r) {
  const p = protocol(r);
  return `
        <article class="inspection-detail-card">
            <dl class="inspection-detail-grid">
                <div>
                    <dt>Wykonano</dt>
                    <dd>${fmt(r.done)}</dd>
                </div>
                <div>
                    <dt>Następny termin</dt>
                    <dd>${fmt(nextDate(r.done, r.months))}</dd>
                </div>
                <div>
                    <dt>Status</dt>
                    <dd><span class="badge ${statusClass(r)}">${statusLabel(r)}</span></dd>
                </div>
                <div>
                    <dt>Protokół</dt>
                    <dd><span class="badge ${p === "DODANY" ? "OK" : "BRAK"}">${p === "DODANY" ? "DODANY" : "BRAK"}</span></dd>
                </div>
                <div class="detail-wide">
                    <dt>Uwagi</dt>
                    <dd>${esc(r.notes || "—")}</dd>
                </div>
            </dl>
            <div class="inspection-detail-actions">
                ${r.protocolPath ? `<button type="button" class="open-file" data-action="open" data-id="${esc(r.id)}">Otwórz protokół</button>` : ""}
                <button type="button" class="secondary" data-action="edit" data-id="${esc(r.id)}">Edytuj</button>
                <button type="button" class="danger" data-action="delete" data-id="${esc(r.id)}">Usuń</button>
                <button type="button" class="secondary" data-action="history" data-id="${esc(r.id)}">Historia</button>
            </div>
        </article>
    `;
}

function mobileTypeStatus(r) {
  const status = statusClass(r);
  if (status === "POBLACK")
    return { className: "POBLACK", label: "PO TERMINIE" };
  if (status === "DO14") return { className: "DO14", label: "≤ 14 DNI" };
  if (status === "DO30") return { className: "DO30", label: "≤ 30 DNI" };
  return { className: "OK", label: "" };
}
function localStatusSummary(records) {
  const urgent = records
    .filter((row) => ["POBLACK", "DO14", "DO30"].includes(statusClass(row)))
    .sort((a, b) =>
      (nextDate(a.done, a.months) || "9999-12-31").localeCompare(
        nextDate(b.done, b.months) || "9999-12-31",
      ),
    );
  if (!urgent.length)
    return '<span class="local-status-empty">Brak pilnych terminów</span>';
  const visible = urgent.slice(0, 2);
  const html = visible
    .map((row) => {
      const info = mobileTypeStatus(row);
      return `<span class="local-status-line"><span class="local-status-type">${esc(row.type || "Bez rodzaju")}</span><span class="badge ${info.className}">${info.label}</span></span>`;
    })
    .join("");
  const remaining = urgent.length - visible.length;
  return (
    html +
    (remaining
      ? `<span class="local-status-more">+${remaining} ${remaining === 1 ? "pilny termin" : "pilne terminy"}</span>`
      : "")
  );
}

function mobileInspectionTypes(records, city, local, expandedTypes) {
  const types = [
    ...new Set(records.map((r) => String(r.type || "Bez rodzaju"))),
  ].sort((a, b) => {
    if (tableSortKey === "nextDate") {
      const first = (type) =>
        sortRows(
          records.filter((r) => String(r.type || "Bez rodzaju") === type),
        )[0];
      const diff = compareRows(
        first(a),
        first(b),
        "nextDate",
        tableSortDirection,
      );
      if (diff) return diff;
    }
    return a.localeCompare(b, "pl");
  });

  return `
        <div class="mobile-inspection-types">
            ${types
              .map((type) => {
                const typeRows = sortRows(
                  records.filter(
                    (r) => String(r.type || "Bez rodzaju") === type,
                  ),
                );
                const typeKey = `${city}|||${local}|||${type}`;
                const statusBadges = [
                  ...new Map(
                    typeRows.map((row) => {
                      const info = mobileTypeStatus(row);
                      return [info.className, info];
                    }),
                  ).values(),
                ]
                  .filter((info) => info.className !== "OK")
                  .map(
                    (info) =>
                      `<span class="badge ${info.className}">${info.label}</span>`,
                  )
                  .join("");
                return `
                    <details class="inspection-type-group" data-type-key="${esc(typeKey)}" ${expandedTypes.has(typeKey) ? "open" : ""}>
                        <summary class="inspection-type-summary">
                            <span class="inspection-type-name">${esc(type)}</span>
                            ${statusBadges ? `<span class="inspection-type-statuses">${statusBadges}</span>` : ""}
                        </summary>
                        <div class="inspection-detail-list">
                            ${typeRows.map(mobileInspectionCard).join("")}
                        </div>
                    </details>
                `;
              })
              .join("")}
        </div>
    `;
}
function renderLocalInspections(local, city) {
  const records = data.filter((r) => r.city === city && r.local === local);

  if (!records.length) {
    return `
            <div class="muted">
                Brak przeglądów dla tego lokalu.
            </div>
        `;
  }

  return `
        <div class="local-inspections-table tablebox">
            <table class="inspections-table">
                ${tableColumns()}
                <thead>
                    <tr>
                        ${tableHeaders()}
                    </tr>
                </thead>
                <tbody>
                    ${rows(sortRows(records))}
                </tbody>
            </table>
        </div>
    `;
}
// Filtrowanie i grupowanie rejestru
function render() {
  rememberView();
  refreshLists();
  const restored = restoreView();

  const q = searchNorm($("#search").value);
  const city = $("#city").value;
  const pr = $("#protocol").value;
  const status = window.activeStatus || "";
  const attentionOnly = window.activeAttention === true;

  const activeFilters = [q, city, pr, status, attentionOnly].filter(
    Boolean,
  ).length;

  $("#filterCountNumber").textContent = activeFilters;
  $("#filterCount").hidden = activeFilters === 0;

  $("#clearFilters").hidden = false;
  $("#clearFilters").disabled = activeFilters === 0;

  const shown = data.filter((r) => {
    const matchesSearch =
      !q ||
      searchNorm(r.city).includes(q) ||
      searchNorm(r.local).includes(q) ||
      searchNorm(r.type).includes(q) ||
      searchNorm(r.notes).includes(q);

    return (
      matchesSearch &&
      (!city || r.city === city) &&
      (!pr || protocol(r) === pr) &&
      (!status || state(r) === status) &&
      (!attentionOnly || requiresAttention(r))
    );
  });

  for (const [id, s] of [
    ["overdue", "PO TERMINIE"],
    ["due", "DO WYKONANIA"],
    ["ok", "OK"],
  ]) {
    $("#" + id).textContent = data.filter((r) => state(r) === s).length;
  }

  $("#all").textContent = data.length;

  const attentionCount = data.filter(requiresAttention).length;
  const attentionBadge = $("#attentionOpenCount");
  attentionBadge.textContent = String(attentionCount);
  attentionBadge.hidden = attentionCount === 0;
  $("#attentionOpen").setAttribute(
    "aria-label",
    attentionCount
      ? `Otwórz alerty: ${countLabel(attentionCount)}`
      : "Otwórz alerty",
  );

  /*
       Zapamiętujemy rozwinięte miasta
    */

  const expandedCities = new Set(
    [...document.querySelectorAll("#cityGroups details.city-group[open]")].map(
      (x) => x.dataset.city,
    ),
  );

  /*
       Zapamiętujemy rozwinięte lokale
    */

  const expandedLocals = new Set(
    [...document.querySelectorAll(".local-inspections.open")].map(
      (x) => `${x.dataset.city}|||${x.dataset.local}`,
    ),
  );

  /* Zapamiętujemy rozwinięte rodzaje przeglądów na telefonie. */
  const expandedTypes = new Set(
    [...document.querySelectorAll(".inspection-type-group[open]")].map(
      (x) => x.dataset.typeKey,
    ),
  );

  /*
       Lista miast
    */

  if (restored && savedView) {
    (savedView.cities || []).forEach((x) => expandedCities.add(x));
    (savedView.locals || []).forEach((x) => expandedLocals.add(x));
    (savedView.types || []).forEach((x) => expandedTypes.add(x));
  }
  const cities = [...new Set(shown.map((r) => r.city || "Bez miasta"))].sort(
    (a, b) => a.localeCompare(b, "pl"),
  );

  /*
       Brak wyników
    */

  if (!cities.length) {
    $("#cityGroups").innerHTML = activeFilters
      ? '<div class="workspace-empty"><strong>Brak wyników</strong><p>Zmień wyszukiwanie lub wyczyść filtry, aby zobaczyć pozostałe przeglądy.</p><button type="button" class="secondary" data-empty-clear>Wyczyść filtry</button></div>'
      : '<div class="workspace-empty"><strong>Rejestr jest pusty</strong><p>Dodaj pierwszy przegląd, aby rozpocząć śledzenie terminów.</p><button type="button" data-empty-add>Dodaj przegląd</button></div>';
    window.renderWorkspace?.(shown);
    return;
  }

  /*
       Generowanie miast
    */

  $("#cityGroups").innerHTML = cities
    .map((cityName) => {
      const cityRows = shown.filter(
        (r) => (r.city || "Bez miasta") === cityName,
      );

      /*
           Lokale w mieście
        */

      const cityLocals = [
        ...new Set(cityRows.map((r) => r.local).filter(Boolean)),
      ].sort((a, b) => {
        if (norm(cityName).includes("katowice")) {
          const order = { "Terminal A": 0, "Terminal B": 1, Pozostałe: 2 };
          const groupDiff =
            order[katowiceTerminal(a)] - order[katowiceTerminal(b)];
          if (groupDiff) return groupDiff;
        }
        return a.localeCompare(b, "pl", { numeric: true });
      });

      /*
           Statystyki miasta
        */

      const overdue = cityRows.filter((r) => state(r) === "PO TERMINIE").length;

      const due = cityRows.filter((r) => state(r) === "DO WYKONANIA").length;

      const localCountText =
        cityLocals.length === 1
          ? "1 lokal"
          : cityLocals.length >= 2 && cityLocals.length <= 4
            ? `${cityLocals.length} lokale`
            : `${cityLocals.length} lokali`;

      return `
            <details
                class="card city-group"
                data-city="${esc(cityName)}"
                ${expandedCities.has(cityName) || attentionOnly ? "open" : ""}
            >

                <summary class="city-summary">

                    <span class="city-summary-main">

                        <strong>
                            ${esc(cityName)}
                        </strong>

                        <span class="city-summary-count">
                            ${localCountText}
                        </span>

                    </span>


                    <span class="city-summary-stats">

                        ${
                          overdue
                            ? `
                                    <span class="badge PO">
                                        Po terminie: ${overdue}
                                    </span>
                                  `
                            : ""
                        }

                        ${
                          due
                            ? `
                                    <span class="badge DO">
                                        Do wykonania: ${due}
                                    </span>
                                  `
                            : ""
                        }

                    </span>

                </summary>


                <div class="local-list">

                    ${cityLocals
                      .map((local, localIndex) => {
                        const localRows = cityRows.filter(
                          (r) => r.local === local,
                        );

                        const localKey = `${cityName}|||${local}`;

                        const isOpen = expandedLocals.has(localKey);

                        const localOverdue = localRows.filter(
                          (r) => state(r) === "PO TERMINIE",
                        ).length;

                        const localDue14 = localRows.filter((r) => {
                          const days = daysUntilExpiry(r);
                          return days !== null && days >= 0 && days <= 14;
                        }).length;

                        const localDue30 = localRows.filter((r) => {
                          const days = daysUntilExpiry(r);
                          return days !== null && days > 14 && days <= 30;
                        }).length;

                        const isKatowice = norm(cityName).includes("katowice");
                        const terminal = isKatowice
                          ? katowiceTerminal(local)
                          : "";
                        const previousTerminal =
                          localIndex > 0 && isKatowice
                            ? katowiceTerminal(cityLocals[localIndex - 1])
                            : "";
                        const terminalHeading =
                          terminal &&
                          terminal !== previousTerminal &&
                          terminal !== "Pozostałe"
                            ? `<div class="terminal-title">${terminal}</div>`
                            : "";
                        return `${terminalHeading}
                            <div class="local-wrapper">

                                <button
                                    type="button"
                                    class="local-item ${isOpen ? "open" : ""}"
                                    data-local-toggle="1"
                                    data-city="${esc(cityName)}"
                                    data-local="${esc(local)}"
                                >

                                    <span class="local-arrow">
                                        ›
                                    </span>


                                    <span class="local-main">

                                        <span class="local-name">
                                            ${esc(local)}
                                        </span>

                                        <span class="local-count">
                                            ${countLabel(localRows.length)}
                                        </span>

                                    </span>


                                    <span class="local-stats">
                                        <span class="local-stats-desktop">
                                            ${localDue30 > 0 ? `<span class="badge DO30">≤ 30 dni: ${localDue30}</span>` : ""}
                                            ${localDue14 > 0 ? `<span class="badge DO14">≤ 14 dni: ${localDue14}</span>` : ""}
                                            ${localOverdue > 0 ? `<span class="badge POBLACK">Po terminie: ${localOverdue}</span>` : ""}
                                        </span>
                                        <span class="local-stats-mobile">${localStatusSummary(localRows)}</span>
                                    </span>

                                </button>


                                <div
                                    class="local-inspections ${
                                      isOpen ? "open" : ""
                                    }"
                                    data-city="${esc(cityName)}"
                                    data-local="${esc(local)}"
                                >

                                    <div class="local-add-row"><button type="button" class="secondary" data-add-inspection data-city="${esc(cityName)}" data-local="${esc(local)}">+ Dodaj przegląd</button></div>
                                    ${
                                      localRows.length
                                        ? `
                                                <div class="tablebox desktop-inspection-table" tabindex="0" aria-label="Tabela szczegółów przeglądów">
                                                    <table class="inspections-table">
                                                        ${tableColumns()}

                                                        <thead>
                                                            <tr>
                                                                ${tableHeaders()}
                                                            </tr>
                                                        </thead>

                                                        <tbody>
                                                            ${rows(
                                                              sortRows(
                                                                localRows,
                                                              ),
                                                            )}
                                                        </tbody>

                                                    </table>
                                                </div>
                                                ${mobileInspectionTypes(
                                                  localRows,
                                                  cityName,
                                                  local,
                                                  expandedTypes,
                                                )}
                                              `
                                        : `
                                                <div class="muted">
                                                    Brak przeglądów dla tego lokalu.
                                                </div>
                                              `
                                    }

                                </div>

                            </div>
                        `;
                      })
                      .join("")}

                </div>

            </details>
        `;
    })
    .join("");
  window.renderWorkspace?.(shown);
}
function showError(msg) {
  $("#notice").hidden = false;
  $("#notice").textContent = "Nie można połączyć się z rejestrem: " + msg;
}

function katowiceTerminal(local) {
  const key = norm(local).replace(/\s+/g, "");
  const code = key.split(/[(:]/)[0].replace(/[^a-z0-9.]/g, "");
  if (["b53", "282", "283", "284"].includes(code)) return "Terminal A";
  if (
    ["260", "261", "262", "263", "b53.ba1", "b53.ba2", "ba1", "ba2"].includes(
      code,
    )
  )
    return "Terminal B";
  return "Pozostałe";
}
// Alerty
function attentionRows() {
  return data.filter(requiresAttention).sort((a, b) => {
    const dateA = nextDate(a.done, a.months) || "9999-12-31",
      dateB = nextDate(b.done, b.months) || "9999-12-31";
    return (
      dateA.localeCompare(dateB) ||
      norm(a.city).localeCompare(norm(b.city), "pl") ||
      norm(a.local).localeCompare(norm(b.local), "pl") ||
      norm(a.type).localeCompare(norm(b.type), "pl")
    );
  });
}
function renderAttentionTable() {
  const body = $("#attentionTableBody");
  if (!body) return;
  const rowsToShow = attentionRows();
  body.innerHTML = rowsToShow.length
    ? rowsToShow
        .map((record) => {
          const expiry = nextDate(record.done, record.months),
            days = daysUntilExpiry(record),
            overdue = days !== null && days < 0,
            daysText =
              days === null
                ? "—"
                : days < 0
                  ? `Po terminie (${Math.abs(days)} ${daysWord(days)})`
                  : days === 0
                    ? "Dzisiaj"
                    : `Za ${days} ${daysWord(days)}`,
            daysClass = overdue ? "overdue" : days === 0 ? "today" : "due";
          return `<tr class="${overdue ? "overdue" : ""}" data-record-detail="${esc(record.id)}" tabindex="0" aria-label="Szczegóły: ${esc(record.local)} — ${esc(record.type)}"><td data-label="Nr lokalu">${esc(record.local)}</td><td data-label="Miasto">${esc(record.city)}</td><td data-label="Rodzaj przeglądu">${esc(record.type)}</td><td data-label="Termin ważności">${fmt(expiry)}</td><td data-label="Status terminu"><span class="attention-days ${daysClass}">${esc(daysText)}</span></td></tr>`;
        })
        .join("")
    : '<tr><td colspan="5" class="muted">Brak przeglądów wymagających uwagi.</td></tr>';
}
function openAttentionTable() {
  renderAttentionTable();
  $("#attentionModal")?.classList.add("open");
}
$("#attentionOpen").addEventListener("click", () => {
  closeUserMenu();
  setAttentionFilter(false);
  openAttentionTable();
});

/* =========================================
   OBSŁUGA FILTRÓW
========================================= */

// Wyszukiwanie
$("#search").addEventListener("input", () => {
  render();
});

// Filtr miasta
$("#city").addEventListener("change", () => {
  render();
});

// Filtr protokołu
$("#protocol").addEventListener("change", () => {
  render();
});

// Szybkie filtry statusu
document.querySelectorAll("[data-quick-status]").forEach((button) => {
  button.addEventListener("click", () => {
    const selectedStatus = button.dataset.quickStatus || "";

    setAttentionFilter(false);

    // Kliknięcie tego samego filtra drugi raz = wyłączenie
    if (window.activeStatus === selectedStatus && selectedStatus) {
      window.activeStatus = "";
    } else {
      window.activeStatus = selectedStatus;
    }

    render();
  });
});

// Wyczyść wszystkie filtry
$("#clearFilters").addEventListener("click", () => {
  $("#search").value = "";
  $("#city").value = "";
  $("#protocol").value = "";
  window.activeStatus = "";
  setAttentionFilter(false);

  render();
});
$("#refreshData").addEventListener("click", async () => {
  const button = $("#refreshData");
  if (!activeSession?.user || button.disabled) return;
  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = "Odświeżanie…";
  try {
    await load();
  } finally {
    button.disabled = false;
    button.textContent = oldText;
    closeUserMenu();
  }
});
$("#closeAttention").addEventListener("click", () => {
  $("#attentionModal").classList.remove("open");
  setAttentionFilter(false);
  render();
});

$("#attentionShowAll").addEventListener("click", () => {
  $("#attentionModal").classList.remove("open");
  setAttentionFilter(false);
  render();
});
async function load() {
  if (!activeSession?.user) return;
  const loadingSession = sessionVersion;
  const [
    { data: rs, error },
    { data: ts, error: te },
    { data: ls, error: le },
    { data: stateRows, error: se },
  ] = await Promise.all([
    sb
      .from("inspections")
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    sb.from("inspection_types").select("name").eq("active", true).order("name"),
    sb.from("locations").select("city,local").order("city").order("local"),
    sb
      .from("app_state")
      .select("value")
      .eq("key", "initial_seed_done")
      .maybeSingle(),
  ]);
  if (loadingSession !== sessionVersion || !activeSession?.user) return;
  if (error) return showError(error.message);
  if (te || le || se)
    return showError(
      [te, le, se]
        .filter(Boolean)
        .map((x) => x.message)
        .join(" | "),
    );
  typeCatalogAvailable = true;
  inspectionTypes = (ts || []).map((x) => x.name).filter(Boolean);
  locations = (ls || [])
    .map((x) => ({
      city: String(x.city || "").trim(),
      local: String(x.local || "").trim(),
    }))
    .filter((x) => x.city && x.local);
  data = rs.map(fromDb);
  if (!data.length && !stateRows && window.DEFAULT_DATA?.length) {
    const seed = window.DEFAULT_DATA.map((r, i) =>
      toDb({ ...r, id: r.id || `seed-${i + 1}` }),
    );
    const { error: e } = await sb.from("inspections").upsert(seed);
    if (e) return showError(e.message);
    const { error: markError } = await sb
      .from("app_state")
      .upsert({ key: "initial_seed_done", value: new Date().toISOString() });
    if (markError) return showError(markError.message);
    return load();
  }
  render();
  $("#notice").hidden = true;
}
// Powiadomienia push
function pushSupported() {
  return (
    location.protocol === "https:" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true
  );
}
function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
function pushKeysMatch(subscription, expectedKey) {
  const current = subscription?.options?.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current),
    b = expectedKey;
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
async function getServiceWorkerRegistration() {
  if (!pushSupported())
    throw new Error("Ta przeglądarka nie obsługuje powiadomień aplikacji.");
  await navigator.serviceWorker.register(
    "./service-worker.js?v=20260828-notification-click2",
    { scope: "./" },
  );
  return navigator.serviceWorker.ready;
}
async function savePushSubscription(subscription) {
  if (!activeSession?.user)
    throw new Error("Najpierw zaloguj się do aplikacji.");
  const json = subscription.toJSON(),
    keys = json.keys || {};
  if (!keys.p256dh || !keys.auth)
    throw new Error("Przeglądarka nie przekazała kluczy subskrypcji.");
  const { error } = await sb.from("push_subscriptions").upsert(
    {
      user_id: activeSession.user.id,
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: String(navigator.userAgent || "").slice(0, 500),
      enabled: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" },
  );
  if (error) throw error;
}
async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const registration = await getServiceWorkerRegistration();
  return registration.pushManager.getSubscription();
}
async function updatePushButton() {
  const button = $("#pushToggle");
  if (!button) return;
  button.hidden = !activeSession?.user;
  if (button.hidden) return;
  if (!PUSH_PUBLIC_KEY) {
    button.disabled = true;
    button.textContent = "Powiadomienia — dokończ konfigurację";
    button.title = "Brakuje publicznego klucza VAPID w supabase-config.js";
    return;
  }
  if (isIosDevice() && !isStandalonePwa()) {
    button.disabled = false;
    button.textContent = "Powiadomienia — dodaj aplikację do ekranu";
    button.title =
      "Na iPhonie i iPadzie powiadomienia działają po dodaniu aplikacji do ekranu początkowego.";
    return;
  }
  if (!pushSupported()) {
    button.disabled = true;
    button.textContent = "Powiadomienia niedostępne";
    button.title =
      "Ta przeglądarka lub sposób otwarcia aplikacji nie obsługuje Web Push.";
    return;
  }
  if (Notification.permission === "denied") {
    button.disabled = false;
    button.textContent = "Powiadomienia zablokowane";
    button.title =
      "Odblokuj powiadomienia w ustawieniach telefonu lub przeglądarki.";
    return;
  }
  button.disabled = false;
  button.title = "";
  const subscription = await currentPushSubscription();
  button.textContent = subscription
    ? "Wyłącz powiadomienia"
    : "Włącz powiadomienia";
}
async function syncExistingPushSubscription() {
  if (
    !activeSession?.user ||
    !PUSH_PUBLIC_KEY ||
    !pushSupported() ||
    Notification.permission !== "granted"
  )
    return;
  try {
    const subscription = await currentPushSubscription();
    if (subscription) await savePushSubscription(subscription);
  } catch (error) {
    console.warn("Nie udało się odświeżyć subskrypcji push:", error);
  }
}
async function enablePushNotifications() {
  if (!activeSession?.user) return alert("Najpierw zaloguj się do aplikacji.");
  if (!PUSH_PUBLIC_KEY)
    return alert("Konfiguracja powiadomień nie została jeszcze zakończona.");
  if (isIosDevice() && !isStandalonePwa())
    return alert(
      "Na iPhonie lub iPadzie najpierw dodaj aplikację do ekranu początkowego, otwórz ją z ikony i ponownie wybierz „Włącz powiadomienia”.",
    );
  if (!pushSupported())
    return alert("Ta przeglądarka nie obsługuje powiadomień aplikacji.");
  try {
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (permission !== "granted") {
      await updatePushButton();
      return alert(
        "Powiadomienia nie zostały włączone. Zgodę można zmienić w ustawieniach telefonu lub przeglądarki.",
      );
    }
    const registration = await getServiceWorkerRegistration();
    const applicationServerKey = base64UrlToUint8Array(PUSH_PUBLIC_KEY);
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !pushKeysMatch(subscription, applicationServerKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    await savePushSubscription(subscription);
    await registration.showNotification("Powiadomienia zostały włączone", {
      body: "Telefon będzie przypominał o przeglądach wymagających uwagi.",
      icon: "./icons/pwa-icon-192.png?v=20260827-logo3",
      badge: "./icons/pwa-icon-192.png?v=20260827-logo3",
      tag: "push-enabled",
      data: { url: "./?filter=attention" },
    });
    await updatePushButton();
  } catch (error) {
    alert("Nie udało się włączyć powiadomień: " + (error?.message || error));
    await updatePushButton();
  }
}
async function disablePushNotifications() {
  try {
    const subscription = await currentPushSubscription();
    if (subscription) {
      const { error } = await sb
        .from("push_subscriptions")
        .delete()
        .eq("user_id", activeSession.user.id)
        .eq("endpoint", subscription.endpoint);
      if (error) throw error;
      await subscription.unsubscribe();
    }
    await updatePushButton();
    alert("Powiadomienia na tym urządzeniu zostały wyłączone.");
  } catch (error) {
    alert("Nie udało się wyłączyć powiadomień: " + (error?.message || error));
  }
}
$("#pushToggle").onclick = async () => {
  const subscription = await currentPushSubscription().catch(() => null);
  if (subscription) await disablePushNotifications();
  else await enablePushNotifications();
};
// Limit bezczynności
function activityStorageKey(session = activeSession) {
  return session?.user?.id
    ? `${ACTIVITY_STORAGE_PREFIX}${session.user.id}`
    : "";
}
function readLastActivity(session = activeSession) {
  const key = activityStorageKey(session);
  if (!key) return 0;
  const value = Number(safeStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function sessionInactive(session = activeSession) {
  const lastActivity = readLastActivity(session);
  return lastActivity > 0 && Date.now() - lastActivity >= INACTIVITY_LIMIT_MS;
}
function scheduleInactivityCheck() {
  clearTimeout(inactivityTimer);
  inactivityTimer = null;
  if (!activeSession?.user) return;
  const lastActivity = readLastActivity(activeSession);
  const remaining = lastActivity
    ? INACTIVITY_LIMIT_MS - (Date.now() - lastActivity)
    : INACTIVITY_LIMIT_MS;
  inactivityTimer = setTimeout(
    () => void enforceInactivity(),
    Math.max(0, remaining),
  );
}
function saveActivity(session = activeSession) {
  const key = activityStorageKey(session);
  if (!key) return;
  const now = Date.now();
  safeStorage.setItem(key, String(now));
  lastActivityWrite = now;
  scheduleInactivityCheck();
}
function clearActivity(session = activeSession) {
  const key = activityStorageKey(session);
  if (key) safeStorage.removeItem(key);
  clearTimeout(inactivityTimer);
  inactivityTimer = null;
  lastActivityWrite = 0;
}
async function expireInactiveSession() {
  if (!activeSession?.user || inactivityLogoutInProgress) return;
  inactivityLogoutInProgress = true;
  const expiredSession = activeSession;
  clearActivity(expiredSession);
  activeSession = null;
  try {
    await sb.auth.signOut({ scope: "local" });
  } finally {
    data = [];
    render();
    await applySession(null);
    $("#loginMessage").textContent =
      `Sesja wygasła po ${INACTIVITY_HOURS} godzinach bezczynności. Zaloguj się ponownie.`;
    inactivityLogoutInProgress = false;
  }
}
async function enforceInactivity() {
  if (!activeSession?.user) return false;
  if (sessionInactive(activeSession)) {
    await expireInactiveSession();
    return true;
  }
  scheduleInactivityCheck();
  return false;
}
async function registerUserActivity() {
  if (!activeSession?.user || inactivityLogoutInProgress) return;
  if (await enforceInactivity()) return;
  if (Date.now() - lastActivityWrite >= ACTIVITY_WRITE_INTERVAL_MS)
    saveActivity(activeSession);
}
function startActivityTracking() {
  ["pointerdown", "touchstart", "scroll"].forEach((eventName) =>
    window.addEventListener(eventName, () => void registerUserActivity(), {
      passive: true,
    }),
  );
  window.addEventListener("keydown", () => void registerUserActivity());
  window.addEventListener("focus", () => void registerUserActivity());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void registerUserActivity();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === activityStorageKey()) void enforceInactivity();
  });
}
async function applySession(s) {
  const previousUserId = activeSession?.user?.id || "";
  if (previousUserId !== (s?.user?.id || "")) sessionVersion++;
  activeSession = s || null;
  document.body.classList.toggle("auth-screen", !s?.user);
  $("#user").textContent = s?.user?.email || "Niezalogowano";
  $("#logout").hidden = !s?.user;
  $("#loginModal").classList.toggle("open", !s?.user);
  if (s?.user) {
    $("#loginMessage").textContent = "";
    $("#loginForm").elements.password.value = "";
    if (previousUserId !== s.user.id || !readLastActivity(s)) saveActivity(s);
    else scheduleInactivityCheck();
    await load();
    if (!activeSession?.user || activeSession.user.id !== s.user.id) return;
    if (previousUserId !== s.user.id)
      window.openWorkspace?.("dashboard", false);
    if (window.activeAttention && !window.attentionModalShown) {
      window.attentionModalShown = true;
      openAttentionTable();
    }
    void syncExistingPushSubscription().finally(() => updatePushButton());
  } else {
    closeUserMenu();
    document.querySelectorAll(".modal.open").forEach((modal) => {
      if (modal.id !== "loginModal") modal.classList.remove("open");
    });
    $("#loginModal").classList.remove("menu-origin");
    $("#loginForm").reset();
    $("#loginForm").elements.password.type = "password";
    $("#passwordToggle").textContent = "Pokaż";
    $("#passwordToggle").setAttribute("aria-pressed", "false");
    data = [];
    locations = [];
    inspectionTypes = [];
    editing = null;
    returnToCalendar = false;
    render();
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
    void updatePushButton();
  }
  window.updateHeaderSession?.();
}
async function start() {
  if (!ready) {
    showError(
      "Aplikacja wymaga konfiguracji Supabase w pliku supabase-config.js.",
    );
    $("#add").disabled = true;
    $("#loginMessage").textContent =
      "Aplikacja wymaga konfiguracji Supabase w pliku supabase-config.js.";
    return;
  }
  const {
    data: { session },
  } = await sb.auth.getSession();
  activeSession = session;
  if (session && sessionInactive(session)) await expireInactiveSession();
  else await applySession(session);
  sb.auth.onAuthStateChange((_event, nextSession) => {
    void applySession(nextSession);
  });
  sb.channel("live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "inspections" },
      load,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "inspection_types" },
      load,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "locations" },
      load,
    )
    .subscribe();
}
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  if (e.target.getAttribute("aria-busy") === "true") return;
  const f = new FormData(e.target);
  $("#loginMessage").textContent = "";
  setFormBusy(e.target, true, "Logowanie…");
  try {
    if (!sb) throw new Error("Aplikacja wymaga konfiguracji połączenia.");
    const { error } = await sb.auth.signInWithPassword({
      email: f.get("email"),
      password: f.get("password"),
    });
    if (error) throw error;
  } catch (error) {
    $("#loginMessage").textContent =
      error.message === "Invalid login credentials"
        ? "Nieprawidłowy e-mail lub hasło. Sprawdź wpisane dane."
        : "Nie udało się zalogować. Sprawdź połączenie i spróbuj ponownie.";
  } finally {
    setFormBusy(e.target, false);
  }
};
$("#register").onclick = async () => {
  if (!config.allowRegistration)
    return ($("#loginMessage").textContent =
      "Rejestracja jest wyłączona. Poproś administratora o utworzenie konta.");
  const f = new FormData($("#loginForm")),
    { error } = await sb.auth.signUp({
      email: f.get("email"),
      password: f.get("password"),
    });
  $("#loginMessage").textContent = error
    ? error.message
    : "Sprawdź skrzynkę e-mail i potwierdź konto.";
};
$("#logout").onclick = async () => {
  if (logoutPending || !activeSession?.user) return;
  logoutPending = true;
  const session = activeSession;
  const buttons = ["#logout", "#workspaceLogout", "#headerLogout"]
    .map($)
    .filter(Boolean);
  buttons.forEach((button) => {
    button.disabled = true;
  });
  try {
    const { error } = await sb.auth.signOut({ scope: "local" });
    if (error) throw error;
    clearActivity(session);
    await applySession(null);
    $("#loginMessage").textContent =
      "Wylogowano. Zaloguj się ponownie, aby otworzyć rejestr.";
    const heading = $("#loginForm h2");
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  } catch (error) {
    const message = "Nie udało się wylogować. Spróbuj ponownie.";
    showToast(message);
  } finally {
    logoutPending = false;
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
};
$("#add").onclick = () => openForm();
$("#cancel").onclick = () => {
  const back = returnToCalendar;
  returnToCalendar = false;
  $("#editModal").classList.remove("open");
  restoreFormScroll();
  if (back) {
    renderCalendar();
    $("#calendarModal").classList.add("open");
  }
};
$("#showCalendar").onclick = () => {
  calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  calendarSelectedDate = "";
  closeUserMenu();
  renderCalendar();
  $("#calendarModal").classList.add("open");
};
$("#closeCalendar").onclick = () =>
  $("#calendarModal").classList.remove("open");
$("#calendarAdd").onclick = () => {
  $("#calendarModal").classList.remove("open");
  openForm(null, true);
  if (calendarSelectedDate)
    $("#editForm").elements.done.value = calendarSelectedDate;
};
$("#calendarToday").onclick = () => {
  const today = new Date();
  calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  calendarSelectedDate = calendarDateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  renderCalendar();
  document.querySelector(".calendar-day.today")?.focus({ preventScroll: true });
};
$("#calendarPrevious").onclick = () => {
  calendarMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() - 1,
    1,
  );
  calendarSelectedDate = "";
  renderCalendar();
};
$("#calendarNext").onclick = () => {
  calendarMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    1,
  );
  calendarSelectedDate = "";
  renderCalendar();
};
$("#calendarDetails").onclick = (e) => {
  const button = e.target.closest("button[data-calendar-edit]");
  if (!button) return;
  const record = data.find(
    (row) => String(row.id) === String(button.dataset.calendarEdit),
  );
  if (!record) return;
  $("#calendarModal").classList.remove("open");
  openForm(record, true);
};
function setUserMenu(open) {
  const isMobile = window.matchMedia("(max-width: 800px)").matches;
  if (open && isMobile) {
    const toggleRect = $("#menuToggle").getBoundingClientRect();
    const menuTop = Math.max(
      8,
      Math.min(toggleRect.bottom + 8, window.innerHeight - 180),
    );
    document.documentElement.style.setProperty(
      "--mobile-menu-top",
      `${menuTop}px`,
    );
  }
  $("#userMenu").hidden = !open;
  $("#menuToggle").setAttribute("aria-expanded", String(open));
  $("#mobileMenuToggle").setAttribute("aria-expanded", String(open));
  $("#menuBackdrop").hidden = !(open && isMobile);
  document.body.classList.toggle("menu-open", open && isMobile);
}
function closeUserMenu() {
  setUserMenu(false);
}
function openMenuModal(selector) {
  closeUserMenu();
  $(selector).classList.add("menu-origin", "open");
}
new MutationObserver(() => {
  if ($("#userMenu").hidden) {
    $("#menuBackdrop").hidden = true;
    document.body.classList.remove("menu-open");
  }
}).observe($("#userMenu"), { attributes: true, attributeFilter: ["hidden"] });
$("#menuToggle").onclick = () => setUserMenu($("#userMenu").hidden);
$("#menuClose").onclick = closeUserMenu;
$("#menuBackdrop").onclick = closeUserMenu;
document.addEventListener("click", (e) => {
  if (!e.target.closest(".user-menu, .mobile-bottom-nav")) closeUserMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#userMenu").hidden) closeUserMenu();
});
function openThemeModal(fromLogin = false) {
  themeOpenedFromLogin = fromLogin;
  closeUserMenu();
  if (fromLogin) $("#loginModal").classList.remove("open");
  $("#themeModal").classList.toggle("menu-origin", !fromLogin);
  $("#themeModal").classList.add("open");
}

function closeThemeModal() {
  $("#themeModal").classList.remove("open");
  if (themeOpenedFromLogin) $("#loginModal").classList.add("open");
  themeOpenedFromLogin = false;
}

$("#themeOpen").onclick = () => openThemeModal(false);
$("#themeOpenLogin").onclick = () => openThemeModal(true);
$("#closeTheme").onclick = closeThemeModal;

document.querySelectorAll("[data-theme]").forEach((btn) => {
  btn.onclick = () => {
    const theme = btn.dataset.theme;

    document.body.classList.remove(
      "theme-blue",
      "theme-corporate",
      "theme-elegant",
      "theme-minimal",
      "theme-dark",
    );
    if (theme !== "default") {
      document.body.classList.add("theme-" + theme);
    }

    safeStorage.setItem("theme", theme);

    document.querySelectorAll("[data-theme]").forEach((option) => {
      const selected = option === btn;
      option.classList.toggle("active", selected);
      option.setAttribute("aria-pressed", String(selected));
    });

    closeThemeModal();
  };
});
// Formularz przeglądu
function openForm(r = null, fromCalendar = false, defaults = {}) {
  rememberView();
  formScroll = {
    x: window.scrollX,
    y: window.scrollY,
    panels: [
      ...document.querySelectorAll(
        ".workspace-view[id], .calendar-event-list[id]",
      ),
    ].map((x) => ({ id: x.id, top: x.scrollTop })),
  };
  returnToCalendar = fromCalendar;
  editing = r?.id || null;
  editingVersion = r?.version ?? null;
  const f = $("#editForm");
  f.reset();
  const v = r || { months: 12, ...defaults };
  ["city", "local", "type", "done", "months", "protocolDate", "notes"].forEach(
    (n) => (f.elements[n].value = v[n] ?? ""),
  );
  refreshLocals();
  const edit = Boolean(r);
  ["city", "local"].forEach((n) => (f.elements[n].readOnly = edit));
  $("#formTitle").textContent = edit ? "Edytuj przegląd" : "Dodaj przegląd";
  $("#fileInfo").textContent = r?.protocolFileName
    ? `Obecny plik: ${r.protocolFileName}. Wybranie nowego zastąpi obecny.`
    : "Opcjonalnie: PDF, dokument lub zdjęcie. Maksymalnie 10 MB.";
  $("#removeAttachment").hidden = !r?.protocolPath;
  $("#editModal").classList.add("open");
}
$("#editForm").elements.city.addEventListener("input", refreshLocals);
function setDefaultMonths() {
  if (editing) return;
  const m = monthsByType[norm($("#editForm").elements.type.value)];
  if (m) $("#editForm").elements.months.value = m;
}
$("#editForm").elements.type.addEventListener("input", setDefaultMonths);
$("#editForm").elements.type.addEventListener("change", setDefaultMonths);
function fillCityFromLocal() {
  if (editing) return;
  const form = $("#editForm");
  const local = norm(form.elements.local.value);
  if (!local) return;
  const source = [
    ...locations,
    ...data.map((r) => ({ city: r.city, local: r.local })),
  ];
  const cities = [
    ...new Set(
      source
        .filter((row) => norm(row.local) === local)
        .map((row) => String(row.city || "").trim())
        .filter(Boolean),
    ),
  ];
  if (cities.length === 1) {
    form.elements.city.value = cities[0];
    refreshLocals();
  }
}
$("#editForm").elements.local.addEventListener("input", fillCityFromLocal);
$("#editForm").elements.local.addEventListener("change", fillCityFromLocal);
$("#removeAttachment").onclick = async () => {
  const r = data.find((x) => String(x.id) === String(editing));
  if (!r?.protocolPath) return;
  if (!confirm(`Usunąć załącznik „${r.protocolFileName || "plik"}”?`)) return;
  const button = $("#removeAttachment");
  button.disabled = true;
  try {
    const { data: changed, error } = await sb
      .from("inspections")
      .update({ protocol_file_name: null, protocol_path: null })
      .eq("id", r.id)
      .eq("version", r.version)
      .is("deleted_at", null)
      .select("id,version");
    if (error) throw error;
    if (!changed?.length)
      throw new Error(
        "Wpis został zmieniony przez inną osobę. Odśwież dane i spróbuj ponownie.",
      );
    editingVersion = changed[0].version;
    const { error: removeError } = await sb.storage
      .from("protocols")
      .remove([r.protocolPath]);
    if (removeError)
      throw new Error(
        `Załącznik odłączono od wpisu, ale nie udało się usunąć pliku: ${removeError.message}`,
      );
    $("#fileInfo").textContent =
      "Opcjonalnie: PDF, dokument lub zdjęcie. Maksymalnie 10 MB.";
    button.hidden = true;
    await load();
    alert("Załącznik został usunięty.");
  } catch (err) {
    alert("Nie udało się usunąć załącznika: " + err.message);
  } finally {
    button.disabled = false;
  }
};
$("#editForm").onsubmit = async (e) => {
  e.preventDefault();
  if (e.target.getAttribute("aria-busy") === "true") return;
  setFormFeedback(e.target);
  let uploadedPath = null;
  let inspectionSaved = false;

  try {
    const f = new FormData(e.target),
      file = f.get("file"),
      city = String(f.get("city") || "").trim(),
      local = String(f.get("local") || "").trim(),
      type = String(f.get("type") || "").trim(),
      months = Number(f.get("months"));

    if (!city || !local || !type)
      throw new Error("Uzupełnij miasto, lokal i rodzaj przeglądu.");
    if (!Number.isInteger(months) || months < 1 || months > 120)
      throw new Error("Okres ważności musi wynosić od 1 do 120 miesięcy.");
    if (
      data.some(
        (r) =>
          String(r.id) !== String(editing) &&
          norm(r.city) === norm(city) &&
          norm(r.local) === norm(local) &&
          norm(r.type) === norm(type),
      )
    )
      throw new Error("Taki przegląd dla tego lokalu już istnieje.");

    setFormBusy(e.target, true);

    // Najpierw zapisujemy słowniki. Dzięki temu błąd pomocniczego zapisu
    // nie wystąpi już po utworzeniu wpisu wskazującego na protokół.
    const { error: typeError } = await sb
      .from("inspection_types")
      .upsert({ name: type, active: true }, { onConflict: "name" });
    if (typeError) throw typeError;
    const { error: locationError } = await sb
      .from("locations")
      .upsert({ city, local }, { onConflict: "city,local" });
    if (locationError) throw locationError;

    if (file && file.size) {
      if (file.size > MAX_PROTOCOL_SIZE)
        throw new Error("Plik protokołu może mieć maksymalnie 10 MB.");
      if (!ALLOWED_PROTOCOL_TYPES.has(file.type))
        throw new Error("Niedozwolony typ pliku protokołu.");
      const ext = file.name.split(".").pop().toLowerCase(),
        path = `${Date.now()}_${crypto.randomUUID()}.${ext}`,
        { error } = await sb.storage
          .from("protocols")
          .upload(path, file, { contentType: file.type });
      if (error) throw error;
      uploadedPath = path;
    }

    const old = data.find((x) => String(x.id) === String(editing)),
      payload = {
        id: editing || `custom-${crypto.randomUUID()}`,
        city,
        local,
        type,
        done: f.get("done") || null,
        months,
        protocolDate: f.get("protocolDate") || null,
        notes: f.get("notes") || "",
      };

    if (uploadedPath) {
      payload.protocolFileName = file.name;
      payload.protocolPath = uploadedPath;
    } else if (old) {
      payload.protocolFileName = old.protocolFileName;
      payload.protocolPath = old.protocolPath;
    }

    let saveError;
    if (editing) {
      const { data: changed, error } = await sb
        .from("inspections")
        .update(toDb(payload))
        .eq("id", editing)
        .eq("version", editingVersion)
        .is("deleted_at", null)
        .select("id");
      saveError = error;
      if (!saveError && !changed?.length)
        throw new Error(
          "Ten wpis został zmieniony lub przeniesiony do kosza przez inną osobę. Odśwież dane i spróbuj ponownie.",
        );
    } else {
      const { error } = await sb.from("inspections").insert(toDb(payload));
      saveError = error;
    }
    if (saveError) throw saveError;
    inspectionSaved = true;

    if (
      uploadedPath &&
      old?.protocolPath &&
      old.protocolPath !== uploadedPath
    ) {
      const { error: removeError } = await sb.storage
        .from("protocols")
        .remove([old.protocolPath]);
      if (removeError)
        console.warn(
          "Nie udało się usunąć poprzedniego pliku:",
          removeError.message,
        );
    }

    const backToCalendar = returnToCalendar;
    returnToCalendar = false;
    $("#editModal").classList.remove("open");
    await load();
    restoreFormScroll();
    showToast("Zapisano przegląd");
    if (backToCalendar) {
      renderCalendar();
      $("#calendarModal").classList.add("open");
    }
  } catch (err) {
    // Nowy plik usuwamy tylko wtedy, gdy wpis nie został zapisany w bazie.
    if (uploadedPath && !inspectionSaved)
      await sb.storage.from("protocols").remove([uploadedPath]);
    setFormFeedback(
      e.target,
      err instanceof TypeError
        ? "Nie udało się zapisać przeglądu. Sprawdź połączenie i spróbuj ponownie."
        : "Nie udało się zapisać przeglądu. " + err.message,
    );
  } finally {
    setFormBusy(e.target, false);
  }
};
async function editRow(id) {
  const r = data.find((x) => String(x.id) === String(id));
  if (r) openForm(r);
}
async function deleteRow(id) {
  const r = data.find((x) => String(x.id) === String(id));
  if (
    !r ||
    !confirm(
      `Przenieść wpis „${r.local} — ${r.type}” do kosza? Można go później przywrócić.`,
    )
  )
    return;
  const { data: changed, error } = await sb
    .from("inspections")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", r.id)
    .eq("version", r.version)
    .is("deleted_at", null)
    .select("id");
  if (error) return alert(error.message);
  if (!changed?.length)
    return alert(
      "Wpis został zmieniony przez inną osobę. Odśwież dane i spróbuj ponownie.",
    );
  await load();
}
async function openFile(id) {
  const r = data.find((x) => String(x.id) === String(id));
  if (!r?.protocolPath) return;
  const { data: link, error } = await sb.storage
    .from("protocols")
    .createSignedUrl(r.protocolPath, 60);
  if (error) return alert(error.message);
  window.open(link.signedUrl, "_blank", "noopener");
}

$("#cityGroups").addEventListener("click", async (e) => {
  /*
       Kliknięcie w lokal
    */

  const addButton = e.target.closest("[data-add-inspection]");
  if (addButton) {
    openForm(null, false, {
      city: addButton.dataset.city,
      local: addButton.dataset.local,
    });
    return;
  }
  const localButton = e.target.closest("button[data-local-toggle]");

  if (localButton) {
    const wrapper = localButton.closest(".local-wrapper");

    const inspections = wrapper.querySelector(".local-inspections");

    const arrow = localButton.querySelector(".local-arrow");

    if (inspections.classList.contains("open")) {
      inspections.classList.remove("open");
      arrow.textContent = "›";
      localButton.classList.remove("open");
    } else {
      inspections.classList.add("open");
      arrow.textContent = "›";
      localButton.classList.add("open");
    }

    return;
  }

  /*
       Sortowanie tabeli
    */

  const th = e.target.closest("th.sortable");

  if (th) {
    const key = th.dataset.sortKey;

    if (tableSortKey === key) {
      tableSortDirection = tableSortDirection === "asc" ? "desc" : "asc";
    } else {
      tableSortKey = key;
      tableSortDirection = "asc";
    }

    render();

    return;
  }

  /*
       Akcje wiersza
    */

  const b = e.target.closest("button[data-action]");

  if (!b) {
    return;
  }

  if (b.dataset.action === "edit") {
    await editRow(b.dataset.id);
  }

  if (b.dataset.action === "delete") {
    await deleteRow(b.dataset.id);
  }

  if (b.dataset.action === "open") {
    await openFile(b.dataset.id);
  }

  if (b.dataset.action === "history") {
    await showHistory(b.dataset.id);
  }
});
$("#closeTypes").onclick = () => $("#typesModal").classList.remove("open");
let editingLocation = null;
let returnToLocations = false;
function openLocationForm(record = null, fromList = false) {
  editingLocation = record ? { city: record.city, local: record.local } : null;
  returnToLocations = fromList;
  $("#localForm").reset();
  $("#localFormTitle").textContent = record
    ? "Edytuj lokal / magazyn"
    : "Dodaj lokal / magazyn";
  $("#localFormDescription").textContent = record
    ? "Zmiana miasta, MPK lub nazwy obejmie także powiązane przeglądy i wpisy w koszu."
    : "Obiekt pojawi się na liście po wybraniu wskazanego miasta.";
  if (record) {
    const parts = locationParts(record.local);
    const form = $("#localForm");
    form.elements.city.value = record.city;
    form.elements.mpk.value = parts.mpk === "—" ? "" : parts.mpk;
    form.elements.name.value = parts.name;
  }
  if (fromList) $("#locationsModal").classList.remove("open");
  openMenuModal("#localModal");
}
function closeLocationForm() {
  $("#localModal").classList.remove("open");
  editingLocation = null;
  if (returnToLocations) {
    renderLocationList();
    $("#locationsModal").classList.add("open");
  }
  returnToLocations = false;
}
$("#addLocal").onclick = () => openLocationForm();
$("#cancelLocal").onclick = closeLocationForm;
$("#localForm").onsubmit = async (e) => {
  e.preventDefault();
  if (e.target.getAttribute("aria-busy") === "true") return;
  setFormFeedback(e.target);
  const f = new FormData(e.target),
    city = String(f.get("city")).trim(),
    mpk = String(f.get("mpk")).trim(),
    name = String(f.get("name")).trim(),
    local = `${mpk} (${name})`;
  if (!city || !mpk || !name)
    return setFormFeedback(e.target, "Uzupełnij miasto, MPK i nazwę obiektu.");
  const original = editingLocation;
  if (original && city === original.city && local === original.local)
    return closeLocationForm();
  if (
    original &&
    locations.some((row) => row.city === city && row.local === local)
  ) {
    return setFormFeedback(
      e.target,
      "Obiekt o takiej nazwie już istnieje w tym mieście.",
    );
  }
  setFormBusy(e.target, true);
  try {
    const { error } = original
      ? await sb.rpc("rename_location", {
          p_old_city: original.city,
          p_old_local: original.local,
          p_new_city: city,
          p_new_local: local,
        })
      : await sb
          .from("locations")
          .upsert({ city, local }, { onConflict: "city,local" });
    if (error) {
      if (original && (error.code === "PGRST202" || error.code === "42883")) {
        throw new Error(
          "Najpierw uruchom EDYCJA_LOKALI.sql w SQL Editor projektu Supabase.",
        );
      }
      throw error;
    }
    await load();
    closeLocationForm();
    showToast(original ? "Zapisano zmiany lokalu" : "Dodano lokal");
  } catch (error) {
    setFormFeedback(e.target, "Nie udało się zapisać lokalu. " + error.message);
  } finally {
    setFormBusy(e.target, false);
  }
};
// Lista lokali
function locationKind(local) {
  return /magazyn/i.test(String(local || "")) ? "Magazyn" : "Lokal";
}
function locationParts(local) {
  const value = String(local || "").trim();
  const match = value.match(/^\s*([^()]+?)\s*\((.*?)\)\s*$/);
  return match
    ? { mpk: match[1].trim(), name: match[2].trim() }
    : { mpk: "—", name: value || "Bez nazwy" };
}
function renderLocationList() {
  const query = searchNorm($("#locationSearch")?.value || "");
  const rows = locations
    .filter(
      (row) =>
        !query ||
        searchNorm(
          `${row.city} ${row.local} ${locationKind(row.local)}`,
        ).includes(query),
    )
    .sort(
      (a, b) =>
        a.city.localeCompare(b.city, "pl") ||
        a.local.localeCompare(b.local, "pl", { numeric: true }),
    );
  const warehouses = rows.filter(
    (row) => locationKind(row.local) === "Magazyn",
  ).length;
  $("#locationListSummary").innerHTML = rows.length
    ? `<strong>${rows.length} obiektów</strong><span>·</span><span>${rows.length - warehouses} ${rows.length - warehouses === 1 ? "lokal" : "lokali"}</span><span>·</span><span>${warehouses} ${warehouses === 1 ? "magazyn" : "magazynów"}</span>`
    : "";
  $("#locationList").innerHTML = rows.length
    ? rows
        .map((row) => {
          const parts = locationParts(row.local),
            kind = locationKind(row.local),
            warehouse = kind === "Magazyn";
          return `<tr><td><span class="location-place"><b>${esc(parts.mpk)} · ${esc(parts.name)}</b><small>${esc(row.local)}</small></span></td><td>${esc(row.city)}</td><td><span class="location-kind ${warehouse ? "warehouse" : ""}">${kind}</span></td><td><span class="location-active">Aktywny</span></td><td><div class="location-actions"><button type="button" class="secondary" data-add-inspection data-city="${esc(row.city)}" data-local="${esc(row.local)}">+ Przegląd</button><button type="button" class="secondary" data-location-edit data-city="${esc(row.city)}" data-local="${esc(row.local)}">Edytuj</button><button type="button" class="danger location-remove" data-city="${esc(row.city)}" data-local="${esc(row.local)}">Usuń</button></div></td></tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="locations-empty">${query ? "Brak lokali pasujących do wyszukiwania." : "Brak lokali i magazynów na liście."}</td></tr>`;
}
$("#closeLocations").onclick = () =>
  $("#locationsModal").classList.remove("open");
$("#locationList").onclick = async (e) => {
  const button = e.target.closest("button[data-city][data-local]");
  if (!button) return;
  const city = button.dataset.city,
    local = button.dataset.local;
  if (button.hasAttribute("data-add-inspection")) {
    openForm(null, false, { city, local });
    return;
  }
  if (button.hasAttribute("data-location-edit")) {
    openLocationForm({ city, local }, true);
    return;
  }
  if (!confirm(`Usunąć lokal „${local}” z miasta ${city}?`)) return;
  const { error } = await sb
    .from("locations")
    .delete()
    .eq("city", city)
    .eq("local", local);
  if (error) return alert("Nie udało się usunąć lokalu: " + error.message);
  await load();
  renderLocationList();
};
async function renderTrash() {
  const { data: deleted, error } = await sb
    .from("inspections")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) return alert("Nie udało się pobrać kosza: " + error.message);
  $("#trashList").innerHTML = deleted?.length
    ? deleted
        .map((row) => {
          const r = fromDb(row);
          return `<li><span><b>${esc(r.city)} — ${esc(r.local)}</b><br>${esc(r.type)} <small class="muted">(usunięto: ${fmt(iso(r.deletedAt))})</small></span><span class="trash-actions"><button type="button" class="secondary" data-restore="${esc(r.id)}" data-version="${esc(r.version)}">Przywróć</button><button type="button" class="permanent-delete" data-permanent-delete="${esc(r.id)}" data-version="${esc(r.version)}" data-city="${esc(r.city)}" data-local="${esc(r.local)}" data-type="${esc(r.type)}" data-protocol-path="${esc(r.protocolPath || "")}">Usuń na stałe</button></span></li>`;
        })
        .join("")
    : '<li class="muted">Kosz jest pusty.</li>';
}
async function permanentlyDelete(id, version, city, local, type, protocolPath) {
  if (
    !confirm(
      `Trwale usunąć wpis „${local} — ${type}”${city ? ` z miasta ${city}` : ""}?\n\nTej operacji nie można cofnąć. Wpis i jego protokół zostaną bezpowrotnie usunięte.`,
    )
  )
    return;
  const { data: changed, error } = await sb
    .from("inspections")
    .delete()
    .eq("id", id)
    .eq("version", Number(version))
    .not("deleted_at", "is", null)
    .select("id");
  if (error)
    return alert("Nie udało się trwale usunąć wpisu: " + error.message);
  if (!changed?.length)
    return alert(
      "Wpis został zmieniony lub przywrócony przez inną osobę. Odśwież kosz i spróbuj ponownie.",
    );
  if (protocolPath) {
    const { error: removeError } = await sb.storage
      .from("protocols")
      .remove([protocolPath]);
    if (removeError)
      alert(
        "Wpis usunięto, ale nie udało się usunąć pliku protokołu: " +
          removeError.message,
      );
  }
  await renderTrash();
  await load();
}
$("#showTrash").onclick = async () => {
  closeUserMenu();
  await renderTrash();
  $("#trashModal").classList.add("menu-origin", "open");
};
$("#closeTrash").onclick = () => $("#trashModal").classList.remove("open");
$("#trashList").onclick = async (e) => {
  const restore = e.target.closest("button[data-restore]");
  if (restore) {
    const { data: changed, error } = await sb
      .from("inspections")
      .update({ deleted_at: null })
      .eq("id", restore.dataset.restore)
      .eq("version", Number(restore.dataset.version))
      .not("deleted_at", "is", null)
      .select("id");
    if (error) return alert(error.message);
    if (!changed?.length)
      return alert(
        "Wpis został zmieniony przez inną osobę. Odśwież kosz i spróbuj ponownie.",
      );
    await renderTrash();
    await load();
    return;
  }
  const permanent = e.target.closest("button[data-permanent-delete]");
  if (!permanent) return;
  await permanentlyDelete(
    permanent.dataset.permanentDelete,
    permanent.dataset.version,
    permanent.dataset.city,
    permanent.dataset.local,
    permanent.dataset.type,
    permanent.dataset.protocolPath,
  );
};
async function showHistory(id) {
  const { data: events, error } = await sb
    .from("inspection_audit")
    .select("action,changed_at,old_data,new_data")
    .eq("inspection_id", id)
    .order("changed_at", { ascending: false });
  if (error) return alert("Nie udało się pobrać historii: " + error.message);
  const labels = {
    INSERT: "utworzono",
    UPDATE: "zaktualizowano",
    DELETE: "usunięto trwale",
  };
  $("#historyList").innerHTML = events?.length
    ? events
        .map((event) => {
          const row = event.new_data || event.old_data || {},
            detail = [row.city, row.local, row.type]
              .filter(Boolean)
              .join(" — ");
          return `<li><span><b>${esc(labels[event.action] || event.action)}</b><br><small class="muted">${esc(new Date(event.changed_at).toLocaleString("pl-PL"))}${detail ? ` · ${esc(detail)}` : ""}</small></span></li>`;
        })
        .join("")
    : '<li class="muted">Brak zapisanej historii.</li>';
  $("#historyModal").classList.add("open");
}
$("#closeHistory").onclick = () => $("#historyModal").classList.remove("open");
$("#export").onclick = () => {
  const h = [
      "Miasto",
      "Nr lokalu",
      "Rodzaj przeglądu",
      "Data wykonania",
      "Ważny przez (mies.)",
      "Data następnego przeglądu",
      "Status",
      "Data dodania protokołu",
      "Uwagi",
    ],
    csv = [
      h,
      ...data.map((r) => [
        r.city,
        r.local,
        r.type,
        r.done,
        r.months,
        nextDate(r.done, r.months),
        state(r),
        r.protocolDate,
        r.notes,
      ]),
    ]
      .map((row) =>
        row
          .map((v) => '"' + String(v ?? "").replaceAll('"', '""') + '"')
          .join(";"),
      )
      .join("\r\n"),
    a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv" }),
  );
  a.download = "przeglady-export.csv";
  a.click();
  URL.revokeObjectURL(a.href);
};
/* Zarządzanie rodzajami przeglądów. */
function resetTypeEditor() {
  editingType = null;
  $("#newType").value = "";
  $("#addType").textContent = "Dodaj";
  $("#cancelTypeEdit").hidden = true;
  $("#typeEditingNote").hidden = true;
}
function renderManagedTypes() {
  const body = $("#typeListTable");
  const names = [...inspectionTypes].sort((a, b) => a.localeCompare(b, "pl"));
  body.innerHTML = names.length
    ? names
        .map((name) => {
          const recordCount = data.filter(
            (row) => norm(row.type) === norm(name),
          ).length;
          return `<tr><td class="type-name-cell">${esc(name)}</td><td class="type-count">${countLabel(recordCount)}</td><td><div class="type-actions"><button type="button" class="secondary" data-edit-type="${esc(name)}">Edytuj</button><button type="button" class="danger" data-delete-type="${esc(name)}">Usuń</button></div></td></tr>`;
        })
        .join("")
    : '<tr><td colspan="3" class="locations-empty">Brak aktywnych rodzajów przeglądów.</td></tr>';
}
function openTypeEditor(name) {
  editingType = name;
  $("#newType").value = name;
  $("#addType").textContent = "Zapisz zmianę";
  $("#cancelTypeEdit").hidden = false;
  $("#typeEditingNote").textContent = `Edytujesz: ${name}`;
  $("#typeEditingNote").hidden = false;
  $("#newType").focus();
}
async function saveInspectionType() {
  const name = $("#newType").value.trim();
  if (!name) return alert("Podaj nazwę rodzaju przeglądu.");
  if (!editingType) {
    const { error } = await sb
      .from("inspection_types")
      .upsert({ name, active: true }, { onConflict: "name" });
    if (error) return alert(error.message);
  } else if (name !== editingType) {
    if (inspectionTypes.some((item) => norm(item) === norm(name)))
      return alert("Taki rodzaj przeglądu już istnieje.");
    const { error: typeError } = await sb
      .from("inspection_types")
      .update({ name })
      .eq("name", editingType);
    if (typeError)
      return alert("Nie udało się zmienić nazwy: " + typeError.message);
    const { error: inspectionError } = await sb
      .from("inspections")
      .update({ type: name })
      .eq("type", editingType)
      .is("deleted_at", null);
    if (inspectionError) {
      await sb
        .from("inspection_types")
        .update({ name: editingType })
        .eq("name", name);
      return alert(
        "Nie udało się zaktualizować istniejących przeglądów: " +
          inspectionError.message,
      );
    }
  }
  resetTypeEditor();
  await load();
  renderManagedTypes();
}
$("#manageTypes").textContent = "Rodzaje przeglądów";
$("#manageTypes").onclick = () => {
  closeUserMenu();
  resetTypeEditor();
  renderManagedTypes();
  $("#typesModal").classList.add("open");
};
$("#addType").onclick = saveInspectionType;
document.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-type]");
  if (edit) {
    openTypeEditor(edit.dataset.editType);
    return;
  }
  const remove = event.target.closest("[data-delete-type]");
  if (remove) {
    const name = remove.dataset.deleteType;
    if (!confirm(`Usunąć „${name}” z listy?`)) return;
    const { error } = await sb
      .from("inspection_types")
      .update({ active: false })
      .eq("name", name);
    if (error) return alert(error.message);
    if (editingType === name) resetTypeEditor();
    await load();
    renderManagedTypes();
    return;
  }
  if (event.target.closest("#cancelTypeEdit")) resetTypeEditor();
  if (event.target.closest("#locationAdd")) {
    openLocationForm(null, true);
  }
});
$("#manageLocations").onclick = () => {
  closeUserMenu();
  renderLocationList();
  $("#locationsModal").classList.add("open");
};
const savedTheme = safeStorage.getItem("theme");

if (savedTheme) {
  document.querySelector(`[data-theme="${savedTheme}"]`)?.click();
} else {
  const defaultTheme = document.querySelector('[data-theme="default"]');
  document.querySelectorAll("[data-theme]").forEach((option) => {
    const selected = option === defaultTheme;
    option.classList.toggle("active", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
}
// Zamykanie przez tło korzysta z tej samej ścieżki co przyciski okien.
$("#closeLogin").onclick = () => {
  if (!document.body.classList.contains("auth-screen"))
    $("#loginModal").classList.remove("open");
};
const modalCloseButtons = {
  loginModal: "closeLogin",
  editModal: "cancel",
  typesModal: "closeTypes",
  localModal: "cancelLocal",
  locationsModal: "closeLocations",
  trashModal: "closeTrash",
  historyModal: "closeHistory",
  calendarModal: "closeCalendar",
  attentionModal: "closeAttention",
  themeModal: "closeTheme",
};
document.querySelectorAll(".modal").forEach((modal) => {
  let startedOnBackdrop = false;
  modal.addEventListener("pointerdown", (event) => {
    startedOnBackdrop = event.target === modal;
  });
  modal.addEventListener("click", (event) => {
    if (event.target !== modal || !startedOnBackdrop) return;
    startedOnBackdrop = false;
    const closeButton = document.getElementById(modalCloseButtons[modal.id]);
    if (closeButton) closeButton.click();
    else modal.classList.remove("open");
  });
});
const mobileActionTargets = {
  add: "add",
  calendar: "showCalendar",
};
document
  .querySelector(".mobile-bottom-nav")
  .addEventListener("click", (event) => {
    const button = event.target.closest("[data-mobile-action]");
    if (!button) return;
    const action = button.dataset.mobileAction;
    if (action === "menu") {
      setUserMenu($("#userMenu").hidden);
    } else {
      closeUserMenu();
      if (action === "home") {
        window.openWorkspace?.("dashboard");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (action === "inspections") {
        window.openWorkspace?.("inspections");
      } else document.getElementById(mobileActionTargets[action])?.click();
    }
  });
function updateMobileNavigation() {
  $("#attentionOpen").setAttribute(
    "aria-expanded",
    String($("#attentionModal").classList.contains("open")),
  );
  const current = !$("#userMenu").hidden
    ? "menu"
    : $("#editModal").classList.contains("open")
      ? "add"
      : document.body.dataset.workspace === "calendar"
        ? "calendar"
        : document.body.dataset.workspace === "inspections"
          ? "inspections"
          : document.body.dataset.workspace === "dashboard"
            ? "home"
            : "menu";
  document.querySelectorAll("[data-mobile-action]").forEach((button) => {
    if (button.dataset.mobileAction === current)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#mobileMenuToggle").setAttribute(
    "aria-expanded",
    String(!$("#userMenu").hidden),
  );
}
const mobileNavigationObserver = new MutationObserver(updateMobileNavigation);
document.querySelectorAll(".modal").forEach((modal) =>
  mobileNavigationObserver.observe(modal, {
    attributes: true,
    attributeFilter: ["class"],
  }),
);
mobileNavigationObserver.observe($("#userMenu"), {
  attributes: true,
  attributeFilter: ["hidden"],
});
window
  .matchMedia("(max-width: 800px)")
  .addEventListener("change", closeUserMenu);
startActivityTracking();
start();

// PWA: instalacja działa przez HTTPS (np. GitHub Pages). Nie zapisujemy danych
// przeglądów lokalnie — aplikacja zawsze pobiera je z Supabase.
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker
    .register("./service-worker.js?v=20260828-notification-click2", {
      scope: "./",
    })
    .catch((error) => console.warn("Nie udało się zarejestrować PWA:", error));
}
