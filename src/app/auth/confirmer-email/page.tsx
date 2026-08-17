"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { synchroniserEmailProfil } from "@/lib/sync-profil-email";
import type { UserRole } from "@/lib/types";
import { Alert, Card, CardBody } from "@/components/ui";

function homePourRole(role: UserRole): string {
  switch (role) {
    case "directeur":
    case "admin_cabinet":
    case "collaborateur":
      return "/cabinet";
    case "client":
      return "/client";
    case "salarie":
      return "/salarie";
  }
}

function ConfirmerEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState("Activation de votre nouvel email…");
  const [erreur, setErreur] = useState<string | null>(null);
  const [home, setHome] = useState("/");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function confirmer() {
      const token_hash = params.get("token_hash");
      const type = (params.get("type") || "email_change") as EmailOtpType;

      if (!token_hash) {
        setErreur("Lien invalide : jeton manquant.");
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        type: type === "email_change" ? "email_change" : type,
        token_hash,
      });

      if (error) {
        const { error: err2 } = await supabase.auth.verifyOtp({
          type: "email_change",
          token_hash,
        });
        if (err2) {
          if (!cancelled) {
            setErreur(
              "Ce lien d'activation n'est plus valide. Demandez un nouvel envoi depuis Mon compte."
            );
          }
          return;
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email || !user.id) {
        if (!cancelled) {
          setErreur("Session introuvable après confirmation.");
        }
        return;
      }

      await synchroniserEmailProfil(supabase, user.id, user.email);

      try {
        await fetch("/api/auth/sync-email", { method: "POST" });
      } catch {
        /* profiles déjà synchronisé ; salaries via API si dispo */
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const dest = profile?.role
        ? homePourRole(profile.role as UserRole)
        : "/";

      if (!cancelled) {
        setHome(dest);
        setMessage(
          `Votre nouvel email (${user.email}) est activé. Vous pouvez désormais vous connecter avec cette adresse.`
        );
        window.history.replaceState({}, "", "/auth/confirmer-email");
        setTimeout(() => router.replace(dest), 2500);
      }
    }

    void confirmer();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardBody className="space-y-3">
          {erreur ? (
            <>
              <Alert variant="error">{erreur}</Alert>
              <Link href="/compte" className="text-sm text-blue-700 hover:underline">
                Retour à Mon compte
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-700">{message}</p>
              <Link href={home} className="text-sm text-blue-700 hover:underline">
                Continuer
              </Link>
            </>
          )}
        </CardBody>
      </Card>
    </main>
  );
}

export default function ConfirmerEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-gray-500">Chargement…</p>
        </main>
      }
    >
      <ConfirmerEmailInner />
    </Suspense>
  );
}
