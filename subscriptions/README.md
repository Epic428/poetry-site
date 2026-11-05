# Nocturne email subscription infrastructure

This is a **separate Cloudflare Worker**. It is not automatically deployed with the public or admin Workers.

## Setup

1. Create a D1 database: `npx wrangler d1 create nocturne-subscriptions`.
2. Replace `REPLACE_WITH_D1_DATABASE_ID` in `subscriptions/wrangler.jsonc` with the actual database ID.
3. Apply the schema: `npx wrangler d1 execute nocturne-subscriptions --remote --file subscriptions/schema.sql --config subscriptions/wrangler.jsonc`.
4. Verify the sending domain in Resend and update `RESEND_FROM_EMAIL` if necessary.
5. Store the API key as a Worker secret: `npx wrangler secret put RESEND_API_KEY --config subscriptions/wrangler.jsonc`.
6. Deploy: `npx wrangler deploy --config subscriptions/wrangler.jsonc`.
7. Add a Cloudflare Worker custom domain, e.g. `subscribe.nocturnepoetry.com`, and set `SUBSCRIPTION_ORIGIN` to that exact origin if using a different origin from the default site.
8. Route subscription requests from the public website to the Worker (same-origin routing or an explicit API base URL). Do **not** enable the signup UI until the API domain, CORS policy and double opt-in flow have been tested.

## API

- `POST /api/subscribe` accepts JSON `{"email":"reader@example.com"}`. Returns a generic response whether the address exists or not.
- `GET /api/confirm?token=...` confirms the email after the reader clicks the emailed link.
- `GET /api/unsubscribe?token=...` unsubscribes via a durable, signed token included in future emails (not implemented yet; see below).

The first implementation includes the signup and confirmation endpoints. Unsubscribe, the reader-facing form, delivery scheduling, email templates for poems, and deployment-triggered notification logic are **not active yet**. Do not send poem announcements until unsubscribe and delivery protections are implemented.

## Security notes

- The Resend key must be a Worker secret, never a repository variable.
- Pending subscriptions expire after 24 hours. Confirmation tokens are stored as SHA-256 hashes, not plaintext.
- Restrict request origins and use Cloudflare WAF / Turnstile rate limiting before making signup public.
- Do not enable the Worker on public preview domains. Never use production subscriber data in previews.
- Cloudflare D1 backups and data retention policies should be configured before production use.
