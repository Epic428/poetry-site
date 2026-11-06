# Nocturne email subscription infrastructure

This is a **separate Cloudflare Worker**. It is not automatically deployed with the public or admin Workers.

## Setup

1. Create a D1 database: `npx wrangler d1 create nocturne-subscriptions`.
2. Replace `REPLACE_WITH_D1_DATABASE_ID` in `subscriptions/wrangler.jsonc` with the actual database ID.
3. Apply the schema: `npx wrangler d1 execute nocturne-subscriptions --remote --file subscriptions/schema.sql --config subscriptions/wrangler.jsonc`.
4. Verify the sending domain in Resend and update `RESEND_FROM_EMAIL` if necessary.
5. Store the API key as a Worker secret: `npx wrangler secret put RESEND_API_KEY --config subscriptions/wrangler.jsonc`.
6. Deploy: `npx wrangler deploy --config subscriptions/wrangler.jsonc`.
7. Add a Cloudflare Worker custom domain, e.g. `subscribe.nocturnepoetry.com`, (no `SUBSCRIPTION_ORIGIN` variable is required).
8. Route subscription requests from the public website to the Worker (same-origin routing or an explicit API base URL). Test the API domain, CORS policy and double opt-in flow before enabling public signup.

## API

- `POST /api/subscribe` accepts JSON `{"email":"reader@example.com","turnstileToken":"..."}`. Returns a generic response whether the address exists or not.
- `GET /api/confirm?token=...` confirms the email after the reader clicks the emailed link.
- `GET /api/unsubscribe?token=...` displays an unsubscribe confirmation form; `POST /api/unsubscribe` with form-encoded `token` marks the subscriber unsubscribed. Future notification emails must include an individually signed token (`subscriber id + '.' + HMAC-SHA256 signature` encoded as base64url) and honor this endpoint.

The signup form and unsubscribe endpoint are included. Delivery scheduling, poem email templates and deployment-triggered notification logic are **not active yet**. Do not send poem announcements until unsubscribe links are included and delivery protections are implemented.

## Turnstile and deployment

1. Create a Cloudflare Turnstile widget restricted to `nocturnepoetry.com`.
2. Set `VITE_TURNSTILE_SITE_KEY` to its **public site key** in the public site's build environment. This is intentionally not a secret; the form remains disabled until it is set.
3. Set the Worker secrets using:
   - `npx wrangler secret put TURNSTILE_SECRET_KEY --config subscriptions/wrangler.jsonc`
   - `npx wrangler secret put UNSUBSCRIBE_SIGNING_KEY --config subscriptions/wrangler.jsonc` (use a long, random secret; preserve it across deployments)
4. Deploy the subscription Worker **before** the public website. The Worker now rejects signup requests without a valid Turnstile token, including the old curl-only test.
5. Set Cloudflare WAF rate limiting on `subscribe.nocturnepoetry.com/api/subscribe` and monitor Resend volume. Turnstile is not a substitute for rate limits.
6. Test signup, confirmation, invalid/expired Turnstile responses, mobile layout and unsubscribing with a generated test link before public launch.

The unsubscribe signing key must remain secret. Changing it invalidates existing unsubscribe links. Never commit it or put it in a `VITE_` variable.


## Security notes

- The Resend key must be a Worker secret, never a repository variable.
- Pending subscriptions expire after 24 hours. Confirmation tokens are stored as SHA-256 hashes, not plaintext.
- Restrict request origins and use Cloudflare WAF / Turnstile rate limiting before making signup public.
- Do not enable the Worker on public preview domains. Never use production subscriber data in previews.
- Cloudflare D1 backups and data retention policies should be configured before production use.
