// Runs only in the subscription Worker after the public site has deployed its manifest.
// D1 is the source of truth for what has been announced; the first successful poll baselines existing poems.
interface DeliveryDB {
  prepare(sql: string): {
    bind(...values: unknown[]): ReturnType<DeliveryDB["prepare"]>;
    first<T>(): Promise<T | null>;
    all<T>(): Promise<{ results: T[] }>;
    run(): Promise<{ meta: { changes: number } }>;
  };
}
interface NotificationEnv {
  DB: DeliveryDB;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  PUBLIC_SITE_URL: string;
  UNSUBSCRIBE_SIGNING_KEY: string;
}
type Poem = { slug: string; title: string; excerpt: string; date: string };
type Subscriber = { id: string; email: string; confirmed_at: number };
const encode = new TextEncoder();
const nowSeconds = () => Math.floor(Date.now() / 1000);
const escape = (s: string) => s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
}
async function signedUnsubscribe(id: string, confirmedAt: number, env: NotificationEnv) {
  const key = await crypto.subtle.importKey("raw",encode.encode(env.UNSUBSCRIBE_SIGNING_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig = await crypto.subtle.sign("HMAC",key,encode.encode(id + ":" + confirmedAt));
  return "https://subscribe.nocturnepoetry.com/api/unsubscribe?token=" + encodeURIComponent(id + "." + base64url(new Uint8Array(sig)));
}
async function fetchManifest(env: NotificationEnv): Promise<Poem[]> {
  const url = new URL("/poems-manifest.json", env.PUBLIC_SITE_URL);
  url.searchParams.set("t", String(Date.now()));
  const response = await fetch(url.toString(), { headers: { Accept: "application/json", "Cache-Control": "no-cache" }, redirect: "manual" });
  if (!response.ok) throw new Error("Public manifest HTTP " + response.status);
  const raw = await response.text();
  if (raw.length > 250000) throw new Error("Manifest too large");
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1 || !("poems" in data) || !Array.isArray(data.poems)) throw new Error("Invalid manifest");
  const poems: Poem[] = [];
  const seen = new Set<string>();
  for (const item of data.poems) {
    if (!item || typeof item !== "object" || typeof item.slug !== "string" || !/^[a-z0-9_-]{1,150}$/.test(item.slug) ||
        typeof item.title !== "string" || !item.title || item.title.length > 200 ||
        typeof item.excerpt !== "string" || item.excerpt.length > 1000 ||
        typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || seen.has(item.slug)) throw new Error("Invalid poem entry");
    seen.add(item.slug);
    poems.push(item as Poem);
  }
  if (poems.length > 5000) throw new Error("Too many poems");
  return poems;
}
async function sendPoem(poem: Poem, subscriber: Subscriber, env: NotificationEnv) {
  const readUrl = new URL("/poems/" + encodeURIComponent(poem.slug), env.PUBLIC_SITE_URL).toString();
  const unsubscribe = await signedUnsubscribe(subscriber.id, subscriber.confirmed_at, env);
  const title = escape(poem.title);
  const excerpt = escape(poem.excerpt || "A new poem is waiting for you.");
  const html = `<!doctype html><html><body style="margin:0;background:#15101e;color:#eee5f6;font-family:Georgia,serif"><div style="max-width:560px;margin:auto;padding:48px 28px"><p style="letter-spacing:3px;color:#c5a0ef;font:12px Arial,sans-serif">✦ NOCTURNE</p><h1 style="font-weight:normal;font-size:36px">${title}</h1><p style="font-size:19px;line-height:1.8">${excerpt}</p><p style="margin:36px 0"><a style="background:#b99ae9;color:#1b1226;padding:14px 22px;text-decoration:none;font:16px Arial,sans-serif" href="${readUrl}">Read the poem</a></p><hr style="border:0;border-top:1px solid #443651"><p style="font:12px/1.7 Arial,sans-serif;color:#b9aabe">You subscribed to new poems from Nocturne.<br><a style="color:#d9baff" href="${unsubscribe}">Unsubscribe</a></p></div></body></html>`;
  const text = `${poem.title}\n\n${poem.excerpt}\n\nRead: ${readUrl}\n\nUnsubscribe: ${unsubscribe}`;
  const response = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type":"application/json", "Idempotency-Key": "nocturne-" + poem.slug + "-" + subscriber.id },
    body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [subscriber.email], subject: "New poem from Nocturne: " + poem.title, html, text, headers: { "List-Unsubscribe": "<" + unsubscribe + ">" } })
  });
  if (!response.ok) throw new Error("Resend HTTP " + response.status);
  const result = await response.json() as { id?: string };
  return result.id ?? null;
}
export async function processPoemNotifications(env: NotificationEnv): Promise<void> {
  if (!env.DB || !env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.PUBLIC_SITE_URL || !env.UNSUBSCRIBE_SIGNING_KEY) throw new Error("Notification configuration incomplete");
  const poems = await fetchManifest(env);
  // Deployment verification: do not announce a poem until its public URL resolves.
  const initialized = await env.DB.prepare("SELECT value FROM notification_settings WHERE key = 'initialized'").first<{value:string}>();
  if (!initialized) {
    // Baseline everything already published; do not email the archive on activation.
    for (const poem of poems) await env.DB.prepare("INSERT OR IGNORE INTO poem_announcements (slug, title, excerpt, first_seen_at, status) VALUES (?, ?, ?, ?, 'baseline')").bind(poem.slug,poem.title,poem.excerpt,nowSeconds()).run();
    await env.DB.prepare("INSERT OR IGNORE INTO notification_settings (key, value) VALUES ('initialized', '1')").run();
    console.log("Poem notification baseline created; no emails sent");
    return;
  }
  for (const poem of poems) {
    const existing = await env.DB.prepare("SELECT slug FROM poem_announcements WHERE slug = ?").bind(poem.slug).first();
    if (existing) continue;
    const url = new URL("/poems/" + encodeURIComponent(poem.slug) + "/", env.PUBLIC_SITE_URL);
    const check = await fetch(url.toString(), { redirect: "follow", headers: { "Cache-Control": "no-cache" } });
    const finalUrl = new URL(check.url);
    if (
      !check.ok ||
      finalUrl.origin !== url.origin ||
      finalUrl.pathname !== url.pathname ||
      !(await check.text()).includes("og:title")
    ) throw new Error("Poem not publicly ready: " + poem.slug);
    await env.DB.prepare("INSERT OR IGNORE INTO poem_announcements (slug, title, excerpt, first_seen_at, status) VALUES (?, ?, ?, ?, 'active')").bind(poem.slug,poem.title,poem.excerpt,nowSeconds()).run();
  }
  // Fixed work budget per scheduled invocation, with leases for overlapping invocations.
  const active = (await env.DB.prepare("SELECT slug, title, excerpt, first_seen_at FROM poem_announcements WHERE status = 'active' ORDER BY first_seen_at ASC LIMIT 10").all<Pick<Poem,"slug"|"title"|"excerpt"> & { first_seen_at: number }>()).results;
  let budget = 20;
  for (const poem of active) {
    if (!budget) break;
    const subscribers = (await env.DB.prepare("SELECT id, email, confirmed_at FROM subscribers WHERE status = 'confirmed' AND confirmed_at IS NOT NULL AND confirmed_at <= ? AND NOT EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.poem_slug = ? AND d.subscriber_id = subscribers.id AND (d.status = 'sent' OR (d.status = 'pending' AND d.updated_at > ?))) ORDER BY id LIMIT ?").bind(poem.first_seen_at, poem.slug, nowSeconds()-600, budget).all<Subscriber>()).results;
    for (const subscriber of subscribers) {
      if (!budget) break;
      // Atomically acquire a 10-minute lease. A stale pending or failed delivery may retry.
      const now = nowSeconds();
      const acquired = await env.DB.prepare("INSERT INTO notification_deliveries (poem_slug, subscriber_id, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?) ON CONFLICT(poem_slug, subscriber_id) DO UPDATE SET status = 'pending', updated_at = excluded.updated_at WHERE notification_deliveries.status = 'failed' OR (notification_deliveries.status = 'pending' AND notification_deliveries.updated_at < ?)").bind(poem.slug,subscriber.id,now,now,now-600).run();
      if (!acquired.meta.changes) continue;
      budget--;
      try {
        // Recheck opt-in immediately before sending.
        const current = await env.DB.prepare("SELECT id, email, confirmed_at FROM subscribers WHERE id = ? AND status = 'confirmed'").bind(subscriber.id).first<Subscriber>();
        if (!current?.confirmed_at || current.confirmed_at > poem.first_seen_at) {
          await env.DB.prepare("UPDATE notification_deliveries SET status = 'failed', updated_at = ? WHERE poem_slug = ? AND subscriber_id = ?").bind(nowSeconds(),poem.slug,subscriber.id).run();
          continue;
        }
        const providerId = await sendPoem(poem,current,env);
        await env.DB.prepare("UPDATE notification_deliveries SET status = 'sent', provider_message_id = ?, updated_at = ? WHERE poem_slug = ? AND subscriber_id = ?").bind(providerId,nowSeconds(),poem.slug,subscriber.id).run();
      } catch (error) {
        console.error("Poem delivery failed",poem.slug,error);
        await env.DB.prepare("UPDATE notification_deliveries SET status = 'failed', updated_at = ? WHERE poem_slug = ? AND subscriber_id = ?").bind(nowSeconds(),poem.slug,subscriber.id).run();
      }
    }
  }
}
