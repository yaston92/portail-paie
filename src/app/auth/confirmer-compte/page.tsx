"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardBody } from "@/components/ui";
import { lireJetonActivation } from "@/lib/lien-activation";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

export default function ConfirmerComptePage() {
  const router = useRouter();
  const [message, setMessage] = useState("Confirmation de votre adresse…");
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const lu = lireJetonActivation(window.location.search);
    if (!lu) {
      setErreur("Ce lien est incomplet. Ouvrez le bouton reçu dans l'email.");
      return;
    }
    const supabase = createClient();
    void supabase.auth
      .verifyOtp({
        token_hash: lu.token_hash,
        type: (lu.type === "signup" || lu.type === "magiclink" || lu.type === "email"
          ? lu.type
          : "email") as EmailOtpType,
      })
      .then(async ({ error }) => {
        if (error) {
          setErreur("Ce lien n'est plus valide. Recréez le compte ou demandez un nouvel envoi.");
          return;
        }
        await fetch("/api/auth/email-confirme", { method: "POST" });
        setMessage("Adresse confirmée. Ouverture de votre cabinet…");
        router.replace("/cabinet");
        router.refresh();
      });
  }, [router]);

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-3">
          <h1 className="text-lg font-semibold">Confirmation du compte</h1>
          {erreur ? (
            <>
              <Alert variant="error">{erreur}</Alert>
              <Button type="button" className="w-full" onClick={() => router.push("/login")}>
                Aller à la connexion
              </Button>
            </>
          ) : (
            <p className="text-sm text-gray-600">{message}</p>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
