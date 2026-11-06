// Minimal D1 interfaces keep this standalone Worker independent of the React TS project.
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  PUBLIC_SITE_URL: string;
  TURNSTILE_SECRET_KEY: string;
  UNSUBSCRIBE_SIGNING_KEY: string;
}

const encoder = new TextEncoder();
const DAY = 86_400;
const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });

function cors(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  return origin === env.PUBLIC_SITE_URL
    ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" }
    : {};
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendConfirmation(email: string, token: string, env: Env, request: Request) {
  const link = new URL("/api/confirm", request.url);
  link.searchParams.set("token", token);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [email],
      subject: "Confirm your Nocturne poetry subscription",
      text: `Confirm your subscription to Nocturne's new-poem emails:\n\n${link.toString()}\n\nThis link expires in 24 hours. If you didn't request this, ignore this message.`,
    }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}


function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
async function unsubscribeSignature(id: string, confirmedAt: number, env: Env): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.UNSUBSCRIBE_SIGNING_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}:${confirmedAt}`));
  return base64url(new Uint8Array(signature));
}
async function verifyUnsubscribeToken(token: string, env: Env): Promise<string | null> {
  const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const subscriber = await env.DB.prepare("SELECT confirmed_at, status FROM subscribers WHERE id = ?").bind(match[1]).first<{confirmed_at: number | null; status: string}>();
  if (!subscriber?.confirmed_at || subscriber.status !== "confirmed") return null;
  const expected = await unsubscribeSignature(match[1], subscriber.confirmed_at, env);
  const a = encoder.encode(match[2]);
  const b = encoder.encode(expected);
  if (a.length !== b.length) return null;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0 ? match[1] : null;
}
// For future poem delivery: `id + "." + await unsubscribeSignature(id, confirmed_at, env)`.
// Only distribute unsubscribe links to the corresponding subscriber.
async function verifyTurnstile(token: string, request: Request, env: Env): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  if (!response.ok) return false;
  const result = await response.json() as { success?: boolean; hostname?: string };
  return result.success === true && result.hostname === new URL(env.PUBLIC_SITE_URL).hostname;
}
function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
async function unsubscribePage(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const id = await verifyUnsubscribeToken(token, env);
  if (!id) return json({ error: "Invalid unsubscribe link." }, 400);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Unsubscribe | Nocturne</title><style>body{background:#0b0c11;color:#eae8f0;font:16px/1.7 system-ui;min-height:90vh;display:grid;place-items:center}main{max-width:440px;padding:2rem;text-align:center}h1{font:2.5rem Georgia,serif;color:#dec9ff}button{padding:1rem 2rem;background:#b794f6;border:0;color:#14101c;cursor:pointer}a{color:#dec9ff}</style></head><body><main><h1>Leave the mailing list?</h1><p>You can unsubscribe from Nocturne's new-poem emails at any time.</p><form method="POST" action="/api/unsubscribe"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Unsubscribe</button></form><p><a href="${escapeHtml(env.PUBLIC_SITE_URL)}">Return to Nocturne</a></p></main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
async function unsubscribe(request: Request, env: Env): Promise<Response> {
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) return json({ error: "Expected form." }, 415);
  const body = await request.text();
  if (body.length > 4096) return json({ error: "Request too large." }, 413);
  const token = new URLSearchParams(body).get("token") ?? "";
  const id = await verifyUnsubscribeToken(token, env);
  if (!id) return json({ error: "Invalid unsubscribe link." }, 400);
  await env.DB.prepare("UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ?, token_hash = NULL, token_expires_at = NULL WHERE id = ? AND status != 'unsubscribed'").bind(Math.floor(Date.now() / 1000), id).run();
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Unsubscribed | Nocturne</title><body style="background:#0b0c11;color:#eae8f0;text-align:center;padding:5rem;font:18px system-ui"><h1>You have been unsubscribed.</h1><p>You will no longer receive Nocturne poem notifications.</p><a style="color:#dec9ff" href="https://nocturnepoetry.com/">Return to Nocturne</a></body></html>', { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

async function subscribe(request: Request, env: Env): Promise<Response> {
  const headers = cors(request, env);
  if (request.headers.get("Origin") !== env.PUBLIC_SITE_URL) {
    return json({ error: "Forbidden." }, 403, headers);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) {
    return json({ error: "Expected JSON." }, 415, headers);
  }
  if (Number(request.headers.get("Content-Length") ?? 0) > 2048) {
    return json({ error: "Request too large." }, 413, headers);
  }
  let input: unknown;
  try {
    const body = await request.text();
    if (encoder.encode(body).byteLength > 2048) return json({ error: "Request too large." }, 413, headers);
    input = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON." }, 400, headers);
  }
  const turnstileToken = typeof input === "object" && input !== null && "turnstileToken" in input && typeof input.turnstileToken === "string" ? input.turnstileToken : "";
  if (!(await verifyTurnstile(turnstileToken, request, env))) {
    return json({ error: "Security check failed. Please try again." }, 403, headers);
  }
  const email = typeof input === "object" && input !== null && "email" in input
    && typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, 400, headers);
  }

  const generic = json({ message: "If this address is eligible, a confirmation email will arrive shortly." }, 202, headers);
  const existing = await env.DB.prepare("SELECT id, status, created_at FROM subscribers WHERE email = ?")
    .bind(email).first<{ id: string; status: string; created_at: number }>();
  if (existing?.status === "confirmed") return generic;

  // Avoid repeated confirmation sends for the same pending address.
  const now = Math.floor(Date.now() / 1000);
  if (existing && existing.status === "pending" && existing.created_at > now - 3600) return generic;

  const id = existing?.id ?? crypto.randomUUID();
  const token = randomToken();
  const tokenHash = await hashToken(token);
  if (existing) {
    const update = await env.DB.prepare("UPDATE subscribers SET status = 'pending', token_hash = ?, token_expires_at = ?, created_at = ?, confirmed_at = NULL, unsubscribed_at = NULL WHERE id = ? AND status IN ('pending', 'unsubscribed')")
      .bind(tokenHash, now + DAY, now, id).run();
    if (!update.meta.changes) return generic;
  } else {
    const insert = await env.DB.prepare("INSERT OR IGNORE INTO subscribers (id, email, status, token_hash, token_expires_at, created_at) VALUES (?, ?, 'pending', ?, ?, ?)")
      .bind(id, email, tokenHash, now + DAY, now).run();
    if (!insert.meta.changes) return generic;
  }
  try {
    await sendConfirmation(email, token, env, request);
  } catch (error) {
    console.error("Subscription confirmation delivery failed", error);
    return json({ error: "Unable to send confirmation right now. Please try again later." }, 502, headers);
  }
  return generic;
}

async function confirm(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Invalid confirmation link." }, 400);
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    "UPDATE subscribers SET status = 'confirmed', confirmed_at = ?, token_hash = NULL, token_expires_at = NULL WHERE token_hash = ? AND status = 'pending' AND token_expires_at > ?"
  ).bind(now, await hashToken(token), now).run();
  if (!result.meta.changes) return json({ error: "Confirmation link is invalid or expired." }, 400);
  return new Response(null, {
    status: 303,
    headers: { Location: `${env.PUBLIC_SITE_URL}/?subscription=confirmed`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (request.method === "OPTIONS" && pathname === "/api/subscribe") {
      if (request.headers.get("Origin") !== env.PUBLIC_SITE_URL) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          ...cors(request, env),
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
        },
      });
    }
    if (pathname === "/api/subscribe" && request.method === "POST") {
      if (!env.DB || !env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.PUBLIC_SITE_URL || !env.TURNSTILE_SECRET_KEY) {
        return json({ error: "Subscription service unavailable." }, 503);
      }
      try { return await subscribe(request, env); }
      catch (error) {
        console.error("Subscription request failed", error);
        return json({ error: "Subscription service unavailable." }, 503);
      }
    }
    if (pathname === "/api/confirm" && request.method === "GET") {
      if (!env.DB || !env.PUBLIC_SITE_URL) return json({ error: "Subscription service unavailable." }, 503);
      try { return await confirm(request, env); }
      catch (error) {
        console.error("Subscription confirmation failed", error);
        return json({ error: "Subscription service unavailable." }, 503);
      }
    }
    if (pathname === "/api/unsubscribe" && (request.method === "GET" || request.method === "POST")) {
      if (!env.DB || !env.UNSUBSCRIBE_SIGNING_KEY || !env.PUBLIC_SITE_URL) return json({ error: "Subscription service unavailable." }, 503);
      try { return request.method === "GET" ? await unsubscribePage(request, env) : await unsubscribe(request, env); }
      catch (error) { console.error("Unsubscribe failed", error); return json({ error: "Subscription service unavailable." }, 503); }
    }
    return json({ error: "Not found." }, 404);
  },
};
