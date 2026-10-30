# Paid Client Access Portal

A full-stack assessment project where an authenticated customer can purchase a sample document using Stripe Checkout. A verified Stripe webhook confirms payment, grants document access, and triggers a Zoho CRM Deal update.

## Features

- Supabase authentication for customers.
- Document catalogue backed by Supabase Postgres.
- Server-side Stripe Checkout session creation.
- Stripe webhook signature verification using the raw request body.
- Webhook event idempotency using `stripe_webhook_events.event_id`.
- Payment and entitlement updates only after a verified paid event.
- Private Supabase Storage with short-lived signed download URLs.
- Customer-specific purchase and entitlement visibility through Row Level Security (RLS).
- Zoho CRM Deal payment-status synchronization.
- CRM sync status tracked separately from payment status.
- Authenticated retry endpoint for failed CRM synchronization.

## Technology

- Next.js App Router (JavaScript)
- React and Tailwind CSS
- Supabase Auth, Postgres, and Storage
- Stripe Checkout and Stripe webhooks
- Zoho CRM API v8

## Architecture and payment flow

1. A customer signs in through Supabase Auth.
2. The browser calls `POST /api/checkout`.
3. The server obtains the authenticated user from the Supabase session. It reads the document and price from Supabase using the server-only service-role key, creates a pending purchase, and creates a Stripe Checkout Session.
4. Stripe redirects the browser to `/checkout/success` or `/checkout/cancel`. These pages are informational; they do not grant document access.
5. Stripe sends a payment event to `POST /api/stripe-webhook`.
6. The webhook verifies the Stripe signature against the raw request body, checks that the Checkout Session is paid, validates its metadata against the pending purchase, and records the Stripe event ID for idempotency.
7. The server marks the purchase as paid and creates the customer's document entitlement.
8. The server attempts to update the mapped Zoho CRM Deal. CRM errors do not undo a successful payment or revoke access. The CRM status remains retryable.
9. The download endpoint authenticates the customer, checks the matching entitlement, and only then creates a short-lived signed URL for the private Storage object.

## Prerequisites

- Node.js and npm
- A Supabase project
- A Stripe account in test mode
- Stripe CLI for local webhook forwarding
- A Zoho CRM account and OAuth client with the required Deals read/update scopes

## Local setup

1. Open the project root in a terminal.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` and enter your own credentials. Never commit `.env.local`.
4. Apply `supabase/schema.sql` in the Supabase SQL Editor. If the database already contains these tables, compare the schema first and avoid overwriting existing production data.
5. Create a **private** Supabase Storage bucket named `paid-documents`.
6. Upload the sample PDF to this exact object path:

   `sample-documents/business-sample.pdf`

7. Confirm that the matching row in `public.documents` uses the same `storage_path`.
8. Start the Next.js application:

   ```bash
   npm run dev
   ```

9. In a second terminal, start Stripe CLI:

   ```bash
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded --forward-to localhost:3000/api/stripe-webhook
   ```

10. Copy the `whsec_...` value printed by the active Stripe CLI listener into `STRIPE_WEBHOOK_SECRET` in `.env.local`. This local CLI signing secret is not the same as a Dashboard endpoint signing secret. Restart Next.js after changing environment variables.
11. Open `http://localhost:3000`, create/sign in to a test account, and run the checkout flow.

## Environment variables

See `.env.example`. It intentionally contains blank values. Populate them locally; do not put credentials in source control, README files, screenshots, or assessment submissions.

Only the Supabase URL and publishable key should have the `NEXT_PUBLIC_` prefix. Keep the Supabase service-role key, Stripe secret key, Stripe webhook secret, and Zoho OAuth credentials server-side.

## Stripe test cards

- Successful payment: `4242 4242 4242 4242`
- Declined payment: `4000 0000 0000 0002`

Use any future expiry date, any valid three-digit CVC, and test billing details. Use Stripe's test mode only.

The Stripe webhook is the source of truth for payment confirmation. Do not grant access just because the browser returns to `/checkout/success`.

## Zoho CRM setup

- Create or identify a Zoho Deal for each customer.
- Store the Deal ID against the matching Supabase Auth user in `public.client_profiles.zoho_deal_id`.
- The current implementation expects the payment-status field API name configured by `ZOHO_PAYMENT_STATUS_FIELD_API_NAME` (development value: `Payment_Status`) and writes `Paid`.
- The OAuth refresh token must include the required Deals read and update scopes.
- If Zoho is unavailable, payment and document access remain valid. CRM sync should remain failed/pending and be retried through the authenticated retry endpoint.

## Database tables

- `documents`: document catalogue, price, and private Storage object path.
- `client_profiles`: mapping from Supabase user to Zoho Deal.
- `purchases`: payment and CRM synchronization state.
- `document_entitlements`: customer access grants.
- `stripe_webhook_events`: processed Stripe event IDs for idempotency.

See `supabase/schema.sql` for the schema, constraints, indexes, RLS policies, and service-role grants used as the submission reference. Compare it with the live Supabase schema before applying it again.

## Main API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/checkout` | POST | Authenticates customer and creates Stripe Checkout Session |
| `/api/stripe-webhook` | POST | Verifies Stripe event and processes paid Checkout Session |
| `/api/documents/[documentId]/download` | GET | Checks entitlement and returns a short-lived signed URL |
| `/api/purchases/[purchaseId]/retry-crm` | POST | Authenticates purchase owner and retries Zoho sync |

Browser return pages:
- `/checkout/success`
- `/checkout/cancel`

## Security notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or Zoho OAuth credentials to the browser.
- Keep the `paid-documents` Storage bucket private.
- Enforce ownership in server routes; do not trust a user ID supplied by the browser.
- Keep RLS enabled on customer data tables.
- Verify Stripe signatures against the raw webhook request body.
- Use the Stripe event ID to make webhook processing idempotent.
- Grant entitlements only after a verified paid event.
- Keep CRM synchronization independent from payment/access state.
- Remove temporary diagnostic routes such as `/api/zoho-test/[dealId]` before submission.
- Remove temporary debug logs, especially those that expose customer IDs or internal data.
- Rotate any credential that was accidentally exposed and update the local environment.
- Ensure `.env.local` is excluded from Git and the submitted archive.

## Verification checklist

The following flows were reported as tested during development. Re-run them against the exact final submission version:

- Successful Stripe test checkout.
- Webhook signature verification and successful webhook response.
- Payment marked paid and entitlement granted.
- Authorized document download through the entitlement check.
- Zoho Deal update and API read-back showing `Payment_Status = Paid`.
- CRM retry flow.
- Declined Stripe test card does not grant document access.
- Duplicate webhook handling.
- No duplicate customer/document entitlements.
- Customer A cannot see or download Customer B's purchase/document.

## Submission checklist

- [ ] Include application source code.
- [ ] Include database schema/migration SQL.
- [ ] Include `.env.example` with placeholders only.
- [ ] Include this README and setup instructions.
- [ ] Confirm `.env.local` and all secrets are excluded.
- [ ] Confirm `.next` and `node_modules` are excluded.
- [ ] Remove the temporary Zoho test endpoint.
- [ ] Confirm the Storage bucket is private.
- [ ] Confirm retry endpoint checks authentication, ownership, and paid status.
- [ ] Re-run tests against the final submitted version.
- [ ] Prepare the 15-minute walkthrough in `docs/WALKTHROUGH.md`.

## Sample document seed

The development sample used these values:

- Title: `Sample Business Document`
- Price: `499` INR
- Storage bucket: `paid-documents`
- Storage path: `sample-documents/business-sample.pdf`

If your final live row or uploaded object differs, use the actual values from Supabase.
