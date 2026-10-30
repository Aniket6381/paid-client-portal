import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { markZohoDealAsPaid } from "@/lib/zoho";

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

export async function POST(request, { params }) {
    try {
        const { purchaseId } = await params;
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
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch { }
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
                { error: "Please sign in." },
                { status: 401 }
            );
        }

        const { data: purchase, error: purchaseError } = await admin
            .from("purchases")
            .select("id, user_id, payment_status")
            .eq("id", purchaseId)
            .eq("user_id", user.id)
            .single();

        if (purchaseError || !purchase) {
            return NextResponse.json(
                { error: "Purchase not found." },
                { status: 404 }
            );
        }

        if (purchase.payment_status !== "paid") {
            return NextResponse.json(
                { error: "Only paid purchases can be synchronized." },
                { status: 400 }
            );
        }

        const { data: profile, error: profileError } = await admin
            .from("client_profiles")
            .select("zoho_deal_id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (profileError) throw profileError;

        if (!profile?.zoho_deal_id) {
            return NextResponse.json(
                { error: "No Zoho Deal is linked to this customer." },
                { status: 400 }
            );
        }

        await markZohoDealAsPaid(profile.zoho_deal_id);

        const { error: updateError } = await admin
            .from("purchases")
            .update({ crm_sync_status: "synced" })
            .eq("id", purchase.id);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            crmSyncStatus: "synced",
        });
    } catch (error) {
        console.error("CRM retry failed:", error.message);

        return NextResponse.json(
            { error: "CRM synchronization failed. Please try again." },
            { status: 500 }
        );
    }
}