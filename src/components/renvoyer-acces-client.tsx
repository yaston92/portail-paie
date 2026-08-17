"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

/** Renvoie le lien d'accès à l'email client déjà rattaché au dossier. */
export function RenvoyerAccesClient({
  dossierId,
  email,
}: {
  dossierId: string;
  email: string;
}) {
  const router = useRouter();
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok" | "erreur">("idle");
  const [message, setMessage] = useState("");

  async function renvoyer() {
    setEtat("envoi");
    setMessage("");
    const res = await fetch(`/api/dossiers/${dossierId}/acces-client`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEtat("erreur");
      setMessage((json as { error?: string }).error ?? "Échec de l'envoi.");
      toastError((json as { error?: string }).error ?? "Échec de l'envoi.");
      return;
    }
    setEtat("ok");
    setMessage(`Lien renvoyé à ${email}.`);
    toastSuccess(`Lien renvoyé à ${email}.`);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {etat === "ok" && <Alert variant="success">{message}</Alert>}
      {etat === "erreur" && <Alert variant="error">{message}</Alert>}
      <Button type="button" variant="secondary" disabled={etat === "envoi"} onClick={renvoyer}>
        {etat === "envoi" ? "Envoi…" : "Renvoyer le lien à ce compte"}
      </Button>
    </div>
  );
}
