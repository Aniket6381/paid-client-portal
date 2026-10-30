
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import Stripe from "stripe";

// export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
    try {
        // 1. Verify the logged-in Supabase user
        const cookieStore = await cookies();

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) => {
                                cookieStore.set(name, value, options);
                            });
                        } catch {
                            // Cookies may be read-only in some server contexts.
                        }
                    },
                },
            }
        );

        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { error: "Please log in before purchasing." },
                { status: 401 }
            );
        }

        // 2. Validate the document ID
        const body = await request.json();
        const { documentId } = body;

        if (
            typeof documentId !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId)
        ) {
            return NextResponse.json(
                { error: "Invalid document ID." },
                { status: 400 }
            );
        }

        console.log("Supabase URL configured:", Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL));
        console.log("Supabase service key configured:", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
        console.log("Stripe secret key configured:", Boolean(process.env.STRIPE_SECRET_KEY));

        // 3. Use the server-only service role to read trusted data
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

        const { data, error } = await admin
            .from("documents")
            .select("id, title")
            .limit(1);

        console.log("Admin document test:", {
            success: !error,
            error: error?.message,
            code: error?.code,
            count: data?.length,
        });

        const { data: document, error: documentError } = await admin
            .from("documents")
            .select("id, title, description, price_inr")
            .eq("id", documentId)
            .single();

        if (documentError || !document) {
            console.error("Document lookup failed:", {
                documentId,
                error: documentError?.message,
                code: documentError?.code,
            });

            return NextResponse.json(
                {
                    error: "Document lookup failed.",
                    details: documentError?.message,
                    code: documentError?.code,
                },
                { status: 404 }
            );
        }

        // 4. Prevent creating another purchase if access already exists
        const { data: existingAccess, error: accessError } = await admin
            .from("document_entitlements")
            .select("id")
            .eq("user_id", user.id)
            .eq("document_id", document.id)
            .maybeSingle();

        if (accessError) {
            throw accessError;
        }

        if (existingAccess) {
            return NextResponse.json(
                { error: "You already have access to this document." },
                { status: 409 }
            );
        }

        // 5. Create a pending purchase record
        const { data: purchase, error: purchaseError } = await admin
            .from("purchases")
            .insert({
                user_id: user.id,
                document_id: document.id,
                payment_status: "pending",
                crm_sync_status: "pending",
            })
            .select("id")
            .single();

        if (purchaseError) {
            throw purchaseError;
        }

        try {
            // Stripe expects the amount in the smallest currency unit (paise for INR)
            const session = await stripe.checkout.sessions.create({
                mode: "payment",
                customer_email: user.email,
                client_reference_id: user.id,
                metadata: {
                    purchase_id: purchase.id,
                    user_id: user.id,
                    document_id: document.id,
                },
                line_items: [
                    {
                        quantity: 1,
                        price_data: {
                            currency: "inr",
                            unit_amount: document.price_inr * 100,
                            product_data: {
                                name: document.title,
                                description: document.description || undefined,
                            },
                        },
                    },
                ],
                success_url:
                    `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url:
                    `${process.env.NEXT_PUBLIC_APP_URL}/checkout/cancel`,
            });

            // 6. Save the Stripe session against this purchase
            const { error: updateError } = await admin
                .from("purchases")
                .update({ stripe_session_id: session.id })
                .eq("id", purchase.id);

            if (updateError) {
                // Keep the pending record for investigation if saving fails.
                throw updateError;
            }

            return NextResponse.json({ url: session.url });
        } catch (stripeError) {
            // Remove the unused pending record if checkout creation failed.
            await admin
                .from("purchases")
                .delete()
                .eq("id", purchase.id)
                .eq("payment_status", "pending");

            throw stripeError;
        }
    } catch (error) {
        console.error("Checkout creation failed:", error.message);

        return NextResponse.json(
            { error: "Unable to start checkout. Please try again." },
            { status: 500 }
        );
    }
}
