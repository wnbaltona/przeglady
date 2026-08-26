import webpush from "npm:web-push@3.6.7";

type Inspection = {
  id: string;
  done: string | null;
  months: number | null;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const PUSH_CRON_SECRET = Deno.env.get("PUSH_CRON_SECRET") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "https://wnbaltona.github.io/";

const restHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function warsawDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addMonths(date: string, monthCount: number) {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  if (![year, month, day, monthCount].every(Number.isFinite) || monthCount < 1) return "";
  const target = month - 1 + Math.trunc(monthCount);
  const targetYear = year + Math.floor(target / 12);
  const targetMonth = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function dayDifference(date: string, today: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

function countLabel(count: number) {
  if (count === 1) return "1 przegląd wymaga uwagi";
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${count} przeglądy wymagają uwagi`;
  return `${count} przeglądów wymaga uwagi`;
}

async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders, ...(init.headers || {}) },
  });
}

async function reserveDailyNotification(subscriptionId: string, alertDate: string) {
  const response = await rest("push_notification_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ subscription_id: subscriptionId, alert_date: alertDate }),
  });
  if (response.ok) return true;
  if (response.status === 409) return false;
  throw new Error(`Nie udało się zapisać blokady duplikatu (${response.status}): ${await response.text()}`);
}

async function releaseDailyNotification(subscriptionId: string, alertDate: string) {
  await rest(`push_notification_log?subscription_id=eq.${encodeURIComponent(subscriptionId)}&alert_date=eq.${encodeURIComponent(alertDate)}`, { method: "DELETE" });
}

async function removeInvalidSubscription(subscriptionId: string) {
  await rest(`push_subscriptions?id=eq.${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
}

async function markSuccess(subscriptionId: string) {
  await rest(`push_subscriptions?id=eq.${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_success_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }),
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !PUSH_CRON_SECRET) {
    return json({ error: "Brakuje wymaganych sekretów funkcji." }, 500);
  }
  if (request.headers.get("x-cron-secret") !== PUSH_CRON_SECRET) return json({ error: "Unauthorized" }, 401);

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const today = warsawDateKey();
  const body = await request.json().catch(() => ({})) as { test?: boolean };

  const subscriptionsResponse = await rest("push_subscriptions?select=id,endpoint,p256dh,auth&enabled=eq.true");
  if (!subscriptionsResponse.ok) return json({ error: await subscriptionsResponse.text() }, 500);
  const allSubscriptions = await subscriptionsResponse.json() as PushSubscriptionRow[];
  const subscriptions = [...new Map(allSubscriptions.map((subscription) => [subscription.endpoint, subscription])).values()];

  let alertCount = 0;
  if (body?.test === true) {
    alertCount = 1;
  } else {
    const inspectionsResponse = await rest("inspections?select=id,done,months&deleted_at=is.null&done=not.is.null");
    if (!inspectionsResponse.ok) return json({ error: await inspectionsResponse.text() }, 500);
    const inspections = await inspectionsResponse.json() as Inspection[];
    alertCount = inspections.filter((inspection) => {
      const expiry = inspection.done && inspection.months ? addMonths(inspection.done, Number(inspection.months)) : "";
      return expiry && dayDifference(expiry, today) <= 14;
    }).length;
  }

  if (!alertCount) return json({ sent: 0, skipped: subscriptions.length, message: "Brak przeglądów wymagających uwagi." });

  const payload = JSON.stringify({
    title: body?.test === true ? "Test powiadomień" : "Przeglądy wymagają uwagi",
    body: body?.test === true ? "Powiadomienia z Rejestru Przeglądów działają prawidłowo." : `${countLabel(alertCount)}. Otwórz aplikację, aby zobaczyć szczegóły.`,
    tag: body?.test === true ? "inspection-test" : "inspection-deadlines",
    url: "./",
  });

  let sent = 0;
  let duplicates = 0;
  let removed = 0;
  const errors: string[] = [];

  for (const subscription of subscriptions) {
    const shouldReserve = body?.test !== true;
    try {
      if (shouldReserve && !(await reserveDailyNotification(subscription.id, today))) {
        duplicates++;
        continue;
      }
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 3600, urgency: "high", topic: "inspection-deadlines" });
      await markSuccess(subscription.id);
      sent++;
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await removeInvalidSubscription(subscription.id);
        removed++;
      } else {
        if (shouldReserve) await releaseDailyNotification(subscription.id, today);
        errors.push(`${subscription.id}: ${(error as Error)?.message || String(error)}`);
      }
    }
  }

  return json({ sent, duplicates, removed, failed: errors.length, errors: errors.slice(0, 10), alertCount });
});
