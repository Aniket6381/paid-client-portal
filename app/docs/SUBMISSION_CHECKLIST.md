# Final submission checklist

## Source and configuration
- [ ] Include the complete Next.js project source.
- [ ] Include `README.md`, `.env.example`, and database schema/migrations.
- [ ] Exclude `.env.local`, all real keys/tokens, and credential screenshots.
- [ ] Exclude `node_modules/` and `.next/`.
- [ ] Confirm `.gitignore` excludes `.env*` except `.env.example`, `node_modules`, and `.next`.

## Security
- [ ] Remove temporary `/api/zoho-test/[dealId]` diagnostic route.
- [ ] Remove temporary debugging logs.
- [ ] Supabase Storage bucket `paid-documents` is private.
- [ ] Download route checks authenticated user and entitlement before signing URL.
- [ ] Retry CRM route checks authenticated user, purchase ownership, and paid status.
- [ ] RLS is enabled and customer policies are in place.
- [ ] No server secrets are imported into client components or exposed via `NEXT_PUBLIC_`.

## Functional verification
- [ ] Successful Stripe test payment grants one entitlement.
- [ ] Declined payment grants no entitlement.
- [ ] Duplicate Stripe event does not duplicate access.
- [ ] Customer A cannot view or download Customer B's document.
- [ ] Zoho Deal is updated to Paid for mapped customer.
- [ ] Failed CRM sync can be retried without repeating payment.

## Walkthrough
- [ ] Follow `docs/WALKTHROUGH.md`.
- [ ] Use test data only.
- [ ] Do not show secrets or personal customer information.
