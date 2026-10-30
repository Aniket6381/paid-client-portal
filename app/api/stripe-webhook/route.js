import { markZohoDealAsPaid } from "@/lib/zoho";
import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const admin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

export async function POST(request) {
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
        return NextResponse.json(
            { error: "Webhook signature or secret is missing." },
            { status: 400 }
        );
    }

    // Read the original body before parsing or modifying it.
    let event;

    try {
        const rawBody = await request.text();
        event = stripe.webhooks.constructEvent(
            rawBody,
            signature,
            webhookSecret
        );
    } catch (error) {
        console.error("Stripe signature verification failed:", error.message);
        return NextResponse.json(
            { error: "Invalid webhook signature." },
            { status: 400 }
        );
    }

    // Ignore unrelated Stripe events.
    const supportedEvents = [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
    ];

    if (!supportedEvents.includes(event.type)) {
        return NextResponse.json({ received: true });
    }

    const session = event.data.object;

    // Do not grant access until Stripe confirms payment.
    if (session.payment_status !== "paid") {
        return NextResponse.json({
            received: true,
            paymentPending: true,
        });
    }

    const purchaseId = session.metadata?.purchase_id;
    const userId = session.metadata?.user_id;
    const documentId = session.metadata?.document_id;

    if (!purchaseId || !userId || !documentId) {
        console.error("Checkout session is missing purchase metadata.");
        return NextResponse.json(
            { error: "Required purchase metadata is missing." },
            { status: 400 }
        );
    }

    // Claim the event ID to make webhook retries idempotent.
    const { error: eventError } = await admin
        .from("stripe_webhook_events")
        .insert({
            event_id: event.id,
            event_type: event.type,
        });

    if (eventError?.code === "23505") {
        return NextResponse.json({
            received: true,
            duplicate: true,
        });
    }

    if (eventError) {
        console.error("Could not record webhook event:", eventError.message);
        return NextResponse.json(
            { error: "Could not record webhook event." },
            { status: 500 }
        );
    }

    try {
        // Match the session and metadata against the original purchase.
        const { data: purchase, error: purchaseError } = await admin
            .from("purchases")
            .select("id, user_id, document_id, payment_status")
            .eq("id", purchaseId)
            .eq("stripe_session_id", session.id)
            .single();

        if (
            purchaseError ||
            !purchase ||
            purchase.user_id !== userId ||
            purchase.document_id !== documentId
        ) {
            throw new Error("Checkout session does not match the purchase.");
        }

        const paymentIntentId =
            typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id || null;

        // Update the purchase without changing a previously paid purchase.
        const { error: updateError } = await admin
            .from("purchases")
            .update({
                payment_status: "paid",
                crm_sync_status: "pending",
                stripe_payment_intent_id: paymentIntentId,
            })
            .eq("id", purchase.id);

        if (updateError) {
            throw updateError;
        }

        // Unique constraints prevent duplicate entitlements.
        const { error: entitlementError } = await admin
            .from("document_entitlements")
            .upsert(
                {
                    user_id: purchase.user_id,
                    document_id: purchase.document_id,
                    purchase_id: purchase.id,
                },
                {
                    onConflict: "user_id,document_id",
                    ignoreDuplicates: true,
                }
            );

        if (entitlementError) throw entitlementError;

        // Payment and document access are now confirmed.
        // Zoho synchronization happens separately.
        let crmSyncStatus = "pending";

        try {
            const { data: profile, error: profileError } = await admin
                .from("client_profiles")
                .select("zoho_deal_id")
                .eq("user_id", purchase.user_id)
                .maybeSingle();

            if (profileError) {
                throw profileError;
            }

            if (!profile?.zoho_deal_id) {
                console.warn(
                    "Zoho Deal ID is missing for user:",
                    purchase.user_id
                );
            } else {
                await markZohoDealAsPaid(profile.zoho_deal_id);
                crmSyncStatus = "synced";
            }
        } catch (crmError) {
            console.error("Zoho CRM synchronization failed:", crmError.message);
            crmSyncStatus = "failed";
        }

        // Update CRM status without changing the successful payment.
        const { error: crmStatusError } = await admin
            .from("purchases")
            .update({ crm_sync_status: crmSyncStatus })
            .eq("id", purchase.id);

        if (crmStatusError) {
            console.error(
                "Could not save CRM synchronization status:",
                crmStatusError.message
            );
        }

        return NextResponse.json({
            received: true,
            paymentStatus: "paid",
            crmSyncStatus,
        });
    } catch (error) {
        console.error("Webhook processing failed:", error.message);

        // Remove the event marker so Stripe can retry after the issue is fixed.
        const { error: deleteError } = await admin
            .from("stripe_webhook_events")
            .delete()
            .eq("event_id", event.id);

        if (deleteError) {
            console.error(
                "Could not release webhook event for retry:",
                deleteError.message
            );
        }

        return NextResponse.json(
            { error: "Payment processing failed. Please retry the webhook." },
            { status: 500 }
        );
    }
}
