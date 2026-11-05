interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  PUBLIC_SITE_URL: string;
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
  const email = typeof input === "object" && input !== null && "email" in input
    && typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, 400, headers);
  }

  const generic = json({ message: "If this address is eligible, a confirmation email will arrive shortly." }, 202, headers);
  const existing = await env.DB.prepare("SELECT id, status, created_at FROM subscribers WHERE email = ?")
    .bind(email).first<{ id: string; status: string; created_at: number }>();
  if (existing?.status === "confirmed" || existing?.status === "unsubscribed") return generic;

  // Avoid repeated confirmation sends for the same pending address.
  const now = Math.floor(Date.now() / 1000);
  if (existing && existing.created_at > now - 3600) return generic;

  const id = existing?.id ?? crypto.randomUUID();
  const token = randomToken();
  const tokenHash = await hashToken(token);
  if (existing) {
    await env.DB.prepare("UPDATE subscribers SET token_hash = ?, token_expires_at = ?, created_at = ? WHERE id = ? AND status = 'pending'")
      .bind(tokenHash, now + DAY, now, id).run();
  } else {
    await env.DB.prepare("INSERT OR IGNORE INTO subscribers (id, email, status, token_hash, token_expires_at, created_at) VALUES (?, ?, 'pending', ?, ?, ?)")
      .bind(id, email, tokenHash, now + DAY, now).run();
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
      if (!env.DB || !env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.PUBLIC_SITE_URL) {
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
    return json({ error: "Not found." }, 404);
  },
};
