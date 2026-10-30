
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessContent() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get("session_id");

    return (
        <main className="mx-auto max-w-xl p-8 text-center">
            <h1 className="text-3xl font-bold">Payment submitted</h1>

            <p className="mt-4 text-gray-600">
                Thank you. We are verifying your payment and updating your document
                access. This page alone does not confirm payment.
            </p>

            {sessionId && (
                <p className="mt-4 break-all text-sm text-gray-500">
                    Checkout session: {sessionId}
                </p>
            )}

            <Link
                href="/"
                className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-3 text-white"
            >
                Return to dashboard
            </Link>
        </main>
    );
}

export default function CheckoutSuccessPage() {
    return (
        <Suspense fallback={<p className="p-8">Loading payment status...</p>}>
            <SuccessContent />
        </Suspense>
    );
}
