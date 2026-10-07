// Daty, statusy i etykiety przeglądów. Bez dostępu do bazy ani interfejsu.
function nextDate(done, intervalMonths) {
  if (!done || !intervalMonths) return "";
  const [year, month, day] = String(done).split("-").map(Number),
    months = Number(intervalMonths);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(months) ||
    months < 1
  )
    return "";
  const target = month - 1 + months,
    targetYear = year + Math.floor(target / 12),
    targetMonth = ((target % 12) + 12) % 12,
    lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate(),
    targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}
function daysUntilExpiry(record) {
  const expiry = nextDate(record.done, record.months);
  if (!expiry) return null;
  const today = new Date();
  const todayAtNoon = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12,
  );
  return Math.round((new Date(expiry + "T12:00:00") - todayAtNoon) / 86400000);
}
function daysWord(value) {
  return Math.abs(Number(value)) === 1 ? "dzień" : "dni";
}
function state(record) {
  const days = daysUntilExpiry(record);
  if (days === null) return "";

  if (days < 0) return "PO TERMINIE";
  if (days <= 30) return "DO WYKONANIA";
  return "OK";
}

function statusClass(record) {
  const days = daysUntilExpiry(record);
  if (days === null) return "";

  if (days < 0) return "POBLACK";
  if (days <= 14) return "DO14";
  if (days <= 30) return "DO30";
  return "OK";
}

function requiresAttention(record) {
  const days = daysUntilExpiry(record);
  return days !== null && days <= 14;
}

function statusLabel(record) {
  const days = daysUntilExpiry(record);
  if (days === null) return "—";

  if (days < 0) return `Po terminie (${Math.abs(days)} ${daysWord(days)})`;
  if (days === 0) return "Do wykonania (dzisiaj)";
  if (days <= 30) return `Do wykonania (za ${days} ${daysWord(days)})`;
  return "OK";
}
function protocol(record) {
  return record.protocolFileName || record.protocolDate
    ? "DODANY"
    : "BRAK PROTOKOŁU";
}
function countLabel(count) {
  if (count === 1) return "1 przegląd";

  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const plural = lastDigit >= 2 && lastDigit <= 4;
  const teens = lastTwoDigits >= 12 && lastTwoDigits <= 14;
  return plural && !teens ? `${count} przeglądy` : `${count} przeglądów`;
}
