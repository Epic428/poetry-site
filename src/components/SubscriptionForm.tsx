import {useEffect, useRef, useState, type FormEvent} from "react";

const API = "https://subscribe.nocturnepoetry.com";
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

export default function SubscriptionForm() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    const render = () => {
      if (!container.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(container.current, {
        sitekey: SITE_KEY,
        theme: "dark",
        callback: (value: string) => setToken(value),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    };
    const scriptId = "nocturne-turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    render();
    const currentScript = script;
    return () => {
      currentScript.removeEventListener("load", render);
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || status === "loading") return;
    setStatus("loading");
    try {
      const response = await fetch(`${API}/api/subscribe`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email, turnstileToken: token}),
      });
      const result: {message?: string; error?: string} = await response.json();
      if (!response.ok) throw new Error(result.error || "Please try again later.");
      setStatus("success");
      setMessage(result.message || "Check your inbox for a confirmation link.");
      setEmail("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Please try again later.");
    } finally {
      setToken("");
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    }
  }

  const confirmed = new URLSearchParams(window.location.search).get("subscription") === "confirmed";
  return <section className="subscribe-section" id="subscribe" aria-labelledby="subscribe-title">
    <div className="container subscribe-inner">
      <div className="kicker">✦ STAY A LITTLE LONGER</div>
      <h2 id="subscribe-title">A little poetry, <em>in your inbox.</em></h2>
      <p>Be the first to read new poems. Just an excerpt and a link, only when something new is published.</p>
      {confirmed && <p className="subscribe-notice" role="status">Your subscription is confirmed. Thank you for reading.</p>}
      {SITE_KEY ? <form className="subscribe-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="subscribe-email">Email address</label>
        <input id="subscribe-email" type="email" name="email" autoComplete="email" placeholder="Your email address" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)}/>
        <button className="btn btn-primary" type="submit" disabled={!token || status === "loading"}>{status === "loading" ? "Sending…" : "Subscribe"}</button>
        <div className="subscribe-turnstile" ref={container}/>
      </form> : <p className="subscribe-notice">Email subscriptions are being configured. You can follow along via <a href="/rss.xml">RSS</a>.</p>}
      {message && <p className="subscribe-notice" role="status" aria-live="polite">{message}</p>}
      <small>Confirm your address to subscribe. Unsubscribe anytime. No spam.</small>
    </div>
  </section>;
}
