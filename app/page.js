
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

export default function Home() {
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [entitlements, setEntitlements] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        setMessage(error.message);
      } else {
        setSession(data.session);
      }

      setLoading(false);
    }

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!session) {
      setDocuments([]);
      setPurchases([]);
      setEntitlements([]);
      return;
    }


    async function loadData() {
      setMessage("Loading documents...");

      const { data: docs, error: docsError } = await supabase
        .from("documents")
        .select("id, title, description, price_inr")
        .order("created_at", { ascending: false });

      if (docsError) {
        console.error("Documents query failed:", docsError);
        setMessage(
          `Could not load documents: ${docsError.message} (Code: ${docsError.code})`
        );
        return;
      }

      console.log("Documents returned by Supabase:", docs);

      const { data: orders, error: ordersError } = await supabase
        .from("purchases")
        .select("id, document_id, payment_status, crm_sync_status")
        .order("created_at", { ascending: false });

      if (ordersError) {
        console.error("Purchases query failed:", ordersError);
        setMessage(
          `Could not load purchases: ${ordersError.message} (Code: ${ordersError.code})`
        );
        return;
      }

      const { data: accessRecords, error: accessError } = await supabase
        .from("document_entitlements")
        .select("id, document_id, purchase_id, granted_at");

      if (accessError) {
        console.error("Entitlements query failed:", accessError);
        setMessage(`Could not load access records: ${accessError.message}`);
        return;
      }

      setDocuments(docs || []);
      setPurchases(orders || []);
      setEntitlements(accessRecords || []);
      setMessage(
        docs?.length
          ? `${docs.length} document(s) loaded successfully.`
          : "The query succeeded, but no documents are visible to this user."
      );
    }

    loadData();
  }, [session, supabase]);

  async function handleAuth(event) {
    event.preventDefault();
    setMessage("");

    const result = isSignup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (isSignup && !result.data.session) {
      setMessage(
        "Account created. Check your email to confirm your account, then log in."
      );
    } else {
      setMessage(
        isSignup ? "Account created successfully." : "Logged in successfully."
      );
    }
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) setMessage(error.message);
  }

  if (loading) {
    return (
      <main className="p-10 text-center">
        Loading portal...
      </main>
    );
  }

  async function handleBuyNow(documentId) {
    setMessage("Redirecting to secure checkout...");

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Could not start checkout.");
        return;
      }

      window.location.href = result.url;
    } catch (error) {
      console.error("Checkout request failed:", error);
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-600">
              PAID CLIENT PORTAL
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              {session ? "Your Documents" : "Welcome"}
            </h1>
          </div>

          {session && (
            <button
              onClick={handleLogout}
              className="rounded-lg border bg-white px-4 py-2 text-sm"
            >
              Log out
            </button>
          )}
        </header>

        {message && (
          <p
            role="status"
            className="mb-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-800"
          >
            {message}
          </p>
        )}

        {!session ? (
          <form
            onSubmit={handleAuth}
            className="max-w-md space-y-4 rounded-2xl border bg-white p-6 shadow-sm"
          >
            <h2 className="text-xl font-semibold">
              {isSignup ? "Create an account" : "Customer login"}
            </h2>

            <label className="block text-sm font-medium">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border p-3"
                placeholder="you@example.com"
              />
            </label>

            <label className="block text-sm font-medium">
              Password
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border p-3"
                placeholder="At least 6 characters"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700"
            >
              {isSignup ? "Sign up" : "Log in"}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSignup(!isSignup);
                setMessage("");
              }}
              className="w-full text-sm text-blue-700"
            >
              {isSignup
                ? "Already registered? Log in"
                : "New customer? Create an account"}
            </button>
          </form>
        ) : (
          <>
            <p className="mb-6 text-sm text-slate-600">
              Logged in as {session.user.email}
            </p>

            <div className="grid gap-5 sm:grid-cols-2">
              {documents.map((document) => {
                const order = purchases.find(
                  (purchase) =>
                    purchase.document_id === document.id
                );

                return (
                  <section
                    key={document.id}
                    className="rounded-2xl border bg-white p-6 shadow-sm"
                  >
                    <h2 className="text-lg font-semibold">
                      {document.title}
                    </h2>

                    <p className="mt-2 text-sm text-slate-600">
                      {document.description}
                    </p>

                    <p className="mt-4 text-xl font-bold">
                      ₹{document.price_inr}
                    </p>

                    <div className="mt-5 space-y-2 text-sm">
                      <p>
                        Payment:{" "}
                        <strong>
                          {order?.payment_status || "Not purchased"}
                        </strong>
                      </p>

                      <p>
                        CRM sync:{" "}
                        <strong>
                          {order?.crm_sync_status || "Not applicable"}
                        </strong>
                      </p>

                      {order?.payment_status === "paid" && order?.crm_sync_status !== "synced" &&
                        (
                          <button
                            onClick={async () => {
                              try {
                                setMessage("Retrying CRM synchronization...");

                                const response = await fetch(
                                  `/api/purchases/${order.id}/retry-crm`,
                                  { method: "POST" }
                                );

                                const result = await response.json();

                                if (!response.ok) {
                                  throw new Error(
                                    result.error || "CRM synchronization failed."
                                  );
                                }

                                setPurchases((previous) =>
                                  previous.map((item) =>
                                    item.id === order.id
                                      ? { ...item, crm_sync_status: "synced" }
                                      : item
                                  )
                                );

                                setMessage("Zoho CRM synchronized successfully!");
                              } catch (error) {
                                setMessage(error.message);
                              }
                            }}
                            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-white"
                          >
                            Retry CRM Sync
                          </button>
                        )}
                    </div>

                    <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm">
                      {entitlements.some(
                        (item) => item.document_id === document.id
                      ) ? (
                        <p className="font-medium text-green-700">
                          Access available
                        </p>
                      ) : (
                        <p className="font-medium text-gray-600">
                          Locked — Purchase required
                        </p>
                      )}
                    </p>

                    {!entitlements.some(
                      (item) => item.document_id === document.id
                    ) && (
                        <button
                          onClick={() => handleBuyNow(document.id)}
                          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                        >
                          Buy Now — ₹{document.price_inr}
                        </button>
                      )}

                    {entitlements.some(
                      (item) => item.document_id === document.id
                    ) && (
                        <button
                          onClick={async () => {
                            try {
                              setMessage("Opening document...");

                              const response = await fetch(
                                `/api/documents/${document.id}/download`
                              );

                              const result = await response.json();

                              if (!response.ok) {
                                throw new Error(result.error || "Unable to open document.");
                              }

                              window.location.assign(result.url);
                            } catch (error) {
                              setMessage(error.message);
                            }
                          }}
                          className="mt-4 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                        >
                          Open Document
                        </button>
                      )}
                  </section>
                );
              })}
            </div>

            {documents.length === 0 && (
              <p className="rounded-xl border bg-white p-6">
                No documents found. Check your Supabase documents table.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
