
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

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

export async function GET(request, { params }) {
    try {
        const routeParams = await params;
        const documentID = routeParams?.documentID;

        console.log("Route params:", routeParams);
        console.log("Extracted document ID:", documentID);

        if (!documentID || documentID === "undefined") {
            return NextResponse.json(
                { error: "Invalid document ID." },
                { status: 400 }
            );
        }

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
                        } catch {
                            // Cookie updates may not be available here.
                        }
                    },
                },
            }
        );

        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user?.id) {
            return NextResponse.json(
                { error: "Please sign in again." },
                { status: 401 }
            );
        }

        console.log("Download request:", {
            userId: user.id,
            documentID: documentID,
        });

        const { data: entitlement, error: entitlementError } = await admin
            .from("document_entitlements")
            .select("id")
            .eq("user_id", user.id)
            .eq("document_id", documentID)
            .maybeSingle();

        if (entitlementError) {
            console.error("Entitlement query failed:", entitlementError);
            throw entitlementError;
        }

        if (!entitlement) {
            return NextResponse.json(
                { error: "You have not purchased this document." },
                { status: 403 }
            );
        }

        const { data: document, error: documentError } = await admin
            .from("documents")
            .select("storage_path")
            .eq("id", documentID)
            .single();

        if (documentError || !document) {
            console.error("Document query failed:", documentError);
            return NextResponse.json(
                { error: "Document not found." },
                { status: 404 }
            );
        }

        const { data, error: storageError } = await admin.storage
            .from("paid-documents")
            .createSignedUrl(document.storage_path, 60);

        if (storageError || !data?.signedUrl) {
            console.error("Storage error:", storageError);
            throw storageError || new Error("Could not create download link.");
        }

        return NextResponse.json({ url: data.signedUrl });
    } catch (error) {
        console.error("Document download error details:", error);
        console.error("Error message:", error.message);
        console.error("Error code:", error.code);
        console.error("Error details:", error.details);
        console.error("Error hint:", error.hint);

        return NextResponse.json(
            { error: "Unable to open document right now." },
            { status: 500 }
        );
    }
}
