# Automatic new-poem notifications

The subscription Worker checks the **deployed** public site's `/poems-manifest.json` every 15 minutes. The public Vite build creates that manifest from Markdown frontmatter. Publishing through the admin commits to GitHub; Cloudflare's automatic public deployment makes the new manifest visible. The notification Worker then detects new slugs, verifies their public poem pages, and sends HTML + plain-text Resend emails to confirmed subscribers.

## Activation (important)

1. Merge this PR and allow Cloudflare to deploy the public website. Verify `https://nocturnepoetry.com/poems-manifest.json` contains `version: 1` and the current archive.
2. Apply the additive D1 migration **before deploying the subscription Worker**:
   `npx wrangler d1 execute nocturne-subscriptions --remote --config subscriptions/wrangler.jsonc --file subscriptions/notification-migration.sql`
3. Deploy the subscription Worker: `npx wrangler deploy --config subscriptions/wrangler.jsonc`.
4. Run one initial scheduled poll **before publishing another poem**. This first poll baselines the existing archive without emailing it. Check logs with `npx wrangler tail nocturne-subscriptions` or query `notification_settings` for `initialized`. The schedule is every 15 minutes.
5. Publish a new poem through the admin. Once Cloudflare has deployed it, the next scheduled poll queues and sends its notifications. Monitor `notification_deliveries` and Resend.

## Safety and behavior

- No retroactive email for poems in the first successful manifest poll.
- Each slug is announced once. Edits to an existing slug do not resend.
- Only confirmed subscribers are eligible; opt-in status is checked again immediately before delivery.
- Each email contains a signed, individual unsubscribe link, and a `List-Unsubscribe` header.
- Delivery rows have a unique (slug, subscriber) key. Leases reduce duplicate concurrent sends; a stable Resend idempotency key also guards retries. As with any external email API, exactly-once delivery cannot be absolutely guaranteed across failures.
- Up to 20 deliveries are attempted per scheduled run. Failed rows retry on subsequent polls; investigate persistent failures and Resend sending limits before growing the list.
- If the manifest is missing, malformed, or a new poem page is not publicly available, the run fails closed instead of sending prematurely.
- The subscription Worker must have `RESEND_API_KEY`, `UNSUBSCRIBE_SIGNING_KEY`, and existing D1 bindings.
- This does not require GitHub Actions, an admin Worker change, or a new API endpoint.
