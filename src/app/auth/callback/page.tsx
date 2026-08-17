"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Relais d'activation Auth :
 * - query token_hash / code → /definir-mot-de-passe
 * - hash #access_token=… (anciens mails Supabase) → session puis même page
 */
function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState("Activation de votre accès…");

  useEffect(() => {
    const token_hash = params.get("token_hash");
    const type = params.get("type");
    const code = params.get("code");

    if (token_hash && type) {
      if (type === "email_change") {
        const dest = new URL("/auth/confirmer-email", window.location.origin);
        dest.searchParams.set("token_hash", token_hash);
        dest.searchParams.set("type", type);
        router.replace(dest.pathname + dest.search);
        return;
      }
      const dest = new URL("/definir-mot-de-passe", window.location.origin);
      dest.searchParams.set("token_hash", token_hash);
      dest.searchParams.set("type", type);
      router.replace(dest.pathname + dest.search);
      return;
    }

    if (code) {
      const dest = new URL("/definir-mot-de-passe", window.location.origin);
      dest.searchParams.set("code", code);
      router.replace(dest.pathname + dest.search);
      return;
    }

    // Fragments (#access_token) : jamais envoyés au serveur : gérés ici
    const hash = window.location.hash?.startsWith("#")
      ? new URLSearchParams(window.location.hash.slice(1))
      : null;
    const access_token = hash?.get("access_token");
    const refresh_token = hash?.get("refresh_token");

    if (access_token && refresh_token) {
      void (async () => {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) {
          setMessage(
            "Ce lien d'activation n'est plus valide. Demandez un nouvel envoi."
          );
          return;
        }
        router.replace("/definir-mot-de-passe");
      })();
      return;
    }

    router.replace("/definir-mot-de-passe");
  }, [params, router]);

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <p className="text-sm text-gray-500">{message}</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-gray-500">Chargement…</p>
        </main>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
