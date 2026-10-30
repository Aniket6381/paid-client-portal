# 15-minute project walkthrough

Use this as a speaking outline. Keep the application running and have the Supabase, Stripe test, and Zoho CRM dashboards ready. Do not display secrets or OAuth tokens.

## 0:00–1:30 — Problem and solution

Explain that the application lets an authenticated customer purchase a protected document. A successful payment grants access, and the related Zoho CRM Deal is updated. Payment/access correctness is kept independent from CRM availability.

## 1:30–3:00 — Architecture

Show the Next.js App Router application, Supabase Auth/Postgres/Storage, Stripe Checkout/webhook, and Zoho CRM. Explain that sensitive operations happen in server routes and service-role/secret credentials are never exposed to the browser.

## 3:00–5:00 — Customer experience

Sign in as a test customer. Show the document catalogue, purchase action, Stripe Checkout, return page, and dashboard purchase/access status.

## 5:00–7:30 — Stripe webhook and idempotency

Show the webhook route. Explain raw-body signature verification, paid-session check, metadata/purchase matching, event-ID deduplication, purchase update, and entitlement upsert. Emphasize that the browser success page does not grant access.

## 7:30–9:30 — Document authorization

Show the private `paid-documents` bucket and the download route. Explain that the server authenticates the customer, checks their entitlement, and only then creates a short-lived signed URL. Demonstrate an unauthorized account being denied.

## 9:30–11:30 — Zoho CRM integration

Show the customer-to-Deal mapping in `client_profiles`, the Zoho update helper, and the Deal payment-status field. Explain the retry behavior and that a CRM outage does not reverse a valid payment or entitlement.

## 11:30–13:00 — Failure scenarios

Demonstrate or describe a declined test card, duplicate webhook event handling, and a failed CRM sync followed by retry. Show that failed payment never creates access.

## 13:00–15:00 — Code quality and close

Show the database constraints/RLS policies, `.env.example`, README, and test results. Summarize the key design decisions: server-side trust boundaries, idempotency, customer ownership, private file delivery, and independent CRM retry.

## Demo preparation

- Start `npm run dev`.
- Start Stripe CLI webhook forwarding in a separate terminal.
- Confirm `.env.local` contains current local credentials without displaying it.
- Use test accounts and Stripe test cards only.
- Ensure a valid Zoho Deal mapping exists for the demo customer.
- Remove temporary diagnostic routes and sensitive debug logs.
- Keep a second test account ready for the access-denial demonstration.
