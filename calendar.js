// Siatka miesiąca, znaczniki alertów i lista terminów.
function calendarDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function dateShift(date, days) {
  const value = new Date(date + "T12:00:00");
  value.setDate(value.getDate() + days);
  return calendarDateKey(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  );
}
function calendarEventClass(event) {
  return event.kind === "reminder30"
    ? "reminder30-dot"
    : event.kind === "reminder14"
      ? "reminder14-dot"
      : "expiry-dot";
}
function calendarInspectionCount(events) {
  return new Set(events.map((event) => String(event.record.id))).size;
}
function calendarEventSort(a, b) {
  return (
    String(a.date).localeCompare(String(b.date)) ||
    norm(a.record.city).localeCompare(norm(b.record.city), "pl") ||
    norm(a.record.local).localeCompare(norm(b.record.local), "pl") ||
    norm(a.record.type).localeCompare(norm(b.record.type), "pl")
  );
}
function calendarEventCard(event, showDate = false) {
  const eventClass =
    event.kind === "reminder30"
      ? "reminder30"
      : event.kind === "reminder14"
        ? "reminder14"
        : "expiry";
  const eventText =
    event.kind === "reminder30"
      ? "Do wykonania (za 30 dni)"
      : event.kind === "reminder14"
        ? "Do wykonania (za 14 dni)"
        : "Termin ważności";
  const expiry = nextDate(event.record.done, event.record.months);
  return `
        <article class="calendar-event-card ${eventClass}">
            <div class="calendar-event-kind">
                <span class="calendar-dot ${calendarEventClass(event)}"></span>
                ${showDate ? `${fmt(event.date)} · ` : ""}${eventText}
            </div>
            <div class="calendar-event-place">${esc(event.record.city)} — ${esc(event.record.local)}</div>
            <div class="calendar-event-type">${esc(event.record.type)}</div>
            <div class="calendar-event-expiry">Ważność do: <strong>${fmt(expiry)}</strong></div>
            <button type="button" class="secondary" data-calendar-edit="${esc(event.record.id)}">Edytuj przegląd</button>
        </article>
    `;
}
function renderCalendarDetails(date, events) {
  const details = $("#calendarDetails");
  if (!events?.length) {
    details.classList.add("muted");
    details.textContent = "Brak terminów w tym dniu.";
    return;
  }
  details.classList.remove("muted");
  const orderedEvents = [...events]
    .map((event) => ({ ...event, date: event.date || date }))
    .sort(calendarEventSort);
  details.innerHTML = `
        <div class="calendar-details-heading">
            <strong>${fmt(date)}</strong>
            <span class="calendar-details-count">${countLabel(calendarInspectionCount(events))}</span>
        </div>
        <div class="calendar-event-list">
            ${orderedEvents.map((event) => calendarEventCard(event)).join("")}
        </div>
    `;
}
function renderCalendarOverview(events, year, month) {
  const details = $("#calendarDetails"),
    prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const monthEvents = Object.entries(events)
    .filter(([date]) => date.startsWith(prefix))
    .flatMap(([date, items]) => items.map((event) => ({ ...event, date })))
    .sort(calendarEventSort);
  if (!monthEvents.length) {
    details.classList.add("muted");
    details.textContent = "W tym miesiącu nie ma oznaczonych terminów.";
    return;
  }
  details.classList.remove("muted");
  details.innerHTML = `
        <div class="calendar-details-heading">
            <strong>Terminy w tym miesiącu</strong>
            <span class="calendar-details-count">${countLabel(calendarInspectionCount(monthEvents))}</span>
        </div>
        <div class="calendar-event-list">${monthEvents.map((event) => calendarEventCard(event, true)).join("")}</div>
    `;
}
function renderCalendar() {
  const year = calendarMonth.getFullYear(),
    month = calendarMonth.getMonth();
  $("#calendarTitle").textContent = new Date(year, month, 1).toLocaleDateString(
    "pl-PL",
    { month: "long", year: "numeric" },
  );
  const events = data.reduce((map, record) => {
    const expiry = nextDate(record.done, record.months);
    if (!expiry) return map;
    const reminder30 = dateShift(expiry, -30),
      reminder14 = dateShift(expiry, -14);
    (map[reminder30] ??= []).push({ record, kind: "reminder30" });
    (map[reminder14] ??= []).push({ record, kind: "reminder14" });
    (map[expiry] ??= []).push({ record, kind: "expiry" });
    return map;
  }, {});
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7,
    days = new Date(year, month + 1, 0).getDate();
  const weekCount = Math.ceil((firstWeekday + days) / 7);
  $("#calendarGrid").style.setProperty("--calendar-weeks", weekCount);
  const today = new Date(),
    todayKey = calendarDateKey(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
  let html = "";
  for (let index = 0; index < firstWeekday; index++)
    html += '<span class="calendar-day empty" aria-hidden="true"></span>';
  for (let day = 1; day <= days; day++) {
    const key = calendarDateKey(year, month, day),
      dayEvents = events[key] || [],
      dots = dayEvents
        .slice(0, 5)
        .map(
          (event) =>
            `<span class="calendar-dot ${calendarEventClass(event)}" aria-hidden="true"></span>`,
        )
        .join("");
    const dayLabel = new Date(year, month, day).toLocaleDateString("pl-PL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      eventLabel = dayEvents.length
        ? `, ${countLabel(dayEvents.length)}`
        : ", brak terminów";
    const mobileDots = [...new Set(dayEvents.map(calendarEventClass))]
      .map(
        (eventClass) =>
          `<span class="calendar-dot ${eventClass}" aria-hidden="true"></span>`,
      )
      .join("");
    html += `<button type="button" class="calendar-day ${dayEvents.length ? "has-events" : ""} ${key === todayKey ? "today" : ""} ${key === calendarSelectedDate ? "selected" : ""}" data-calendar-date="${key}" aria-label="${esc(dayLabel + eventLabel)}" aria-current="${key === todayKey ? "date" : "false"}" aria-pressed="${key === calendarSelectedDate}"><span class="calendar-date">${day}</span>${dayEvents.length ? `<span class="calendar-events calendar-desktop-events">${dots}</span><span class="calendar-events calendar-mobile-events">${mobileDots}</span>` : ""}</button>`;
  }
  for (let index = firstWeekday + days; index < weekCount * 7; index++)
    html += '<span class="calendar-day empty" aria-hidden="true"></span>';
  $("#calendarGrid").innerHTML = html;
  $("#calendarGrid").onclick = (e) => {
    const day = e.target.closest("[data-calendar-date]");
    if (!day) return;
    calendarSelectedDate = day.dataset.calendarDate;
    renderCalendar();
  };
  if (calendarSelectedDate)
    renderCalendarDetails(calendarSelectedDate, events[calendarSelectedDate]);
  else renderCalendarOverview(events, year, month);
}
