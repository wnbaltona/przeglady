import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Inspection = {
  id: string;
  city: string;
  local: string;
  type: string;
  done: string | null;
  months: number;
};

type Alert = Inspection & {
  expiresOn: string;
  daysUntilExpiry: number;
  kind: "daily" | "five_day";
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

function addMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay)));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("ALERT_FROM");
  const recipients = (Deno.env.get("ALERT_RECIPIENTS") || "weronika.niziolek11@gmail.com")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (!url || !serviceRoleKey || !resendKey || !sender || !recipients.length) {
    return Response.json({ error: "Missing required Edge Function secrets." }, { status: 500 });
  }

  const supabase = createClient(url, serviceRoleKey);
  const { data: inspections, error } = await supabase
    .from("inspections")
    .select("id, city, local, type, done, months")
    .is("deleted_at", null);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayKey = dateKey(today);
  const alerts: Alert[] = ((inspections ?? []) as Inspection[]).flatMap((inspection) => {
    if (!inspection.done || !inspection.months) return [];
    const expiry = addMonths(inspection.done, Number(inspection.months));
    const daysUntilExpiry = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
    const kind = daysUntilExpiry >= 0 && daysUntilExpiry <= 14
      ? "daily"
      : daysUntilExpiry > 14 && daysUntilExpiry <= 30 && daysUntilExpiry % 5 === 0
      ? "five_day"
      : null;
    return kind ? [{ ...inspection, expiresOn: dateKey(expiry), daysUntilExpiry, kind }] : [];
  });

  if (!alerts.length) return Response.json({ sent: false, message: "No alerts due today." });

  const { data: alreadySent, error: logReadError } = await supabase
    .from("inspection_alert_log")
    .select("inspection_id, alert_kind")
    .eq("alert_date", todayKey)
    .in("inspection_id", alerts.map((alert) => alert.id));

  if (logReadError) return Response.json({ error: logReadError.message }, { status: 500 });

  const sentKeys = new Set((alreadySent || []).map((row) => `${row.inspection_id}:${row.alert_kind}`));
  const pending = alerts.filter((alert) => !sentKeys.has(`${alert.id}:${alert.kind}`));
  if (!pending.length) return Response.json({ sent: false, message: "Alerts already sent today." });

  const rows = pending.map((alert) => `
    <tr>
      <td>${alert.city}</td><td>${alert.local}</td><td>${alert.type}</td>
      <td>${new Date(`${alert.expiresOn}T12:00:00`).toLocaleDateString("pl-PL")}</td>
      <td>${alert.daysUntilExpiry === 0 ? "dzisiaj" : `za ${alert.daysUntilExpiry} dni`}</td>
    </tr>`).join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: sender,
      to: recipients,
      subject: `Przeglądy: ${pending.length} termin(y/ów) wymaga(ją) uwagi`,
      html: `<h2>Alerty przeglądów</h2><p>Poniższe przeglądy tracą ważność w ciągu 30 dni.</p><table border="1" cellpadding="8" cellspacing="0"><thead><tr><th>Miasto</th><th>Lokal</th><th>Rodzaj</th><th>Data utraty ważności</th><th>Pozostało</th></tr></thead><tbody>${rows}</tbody></table>`,
    }),
  });

  if (!response.ok) {
    return Response.json({ error: `Email provider error: ${await response.text()}` }, { status: 502 });
  }

  const { error: logWriteError } = await supabase.from("inspection_alert_log").insert(
    pending.map((alert) => ({
      inspection_id: alert.id,
      alert_kind: alert.kind,
      alert_date: todayKey,
      expires_on: alert.expiresOn,
      recipients: recipients.join(", "),
    })),
  );

  if (logWriteError) return Response.json({ error: logWriteError.message }, { status: 500 });
  return Response.json({ sent: true, count: pending.length });
});
