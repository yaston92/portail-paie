"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

/** Pose un nouveau mot de passe provisoire pour le client déjà rattaché. */
export function RenvoyerAccesClient({
  dossierId,
  email,
}: {
  dossierId: string;
  email: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok" | "erreur">("idle");
  const [message, setMessage] = useState("");

  async function renvoyer() {
    if (password.length < 8) {
      setEtat("erreur");
      setMessage("Au moins 8 caractères.");
      toastError("Le mot de passe provisoire doit contenir au moins 8 caractères.");
      return;
    }
    setEtat("envoi");
    setMessage("");
    const res = await fetch(`/api/dossiers/${dossierId}/acces-client`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEtat("erreur");
      setMessage((json as { error?: string }).error ?? "Échec.");
      toastError((json as { error?: string }).error ?? "Échec.");
      return;
    }
    setEtat("ok");
    setPassword("");
    const ok = `Mot de passe provisoire enregistré pour ${email}. Communiquez-le au client.`;
    setMessage(ok);
    toastSuccess(ok);
    router.refresh();
  }

  return (
    <div className="space-y-2 mt-2">
      {etat === "ok" && <Alert variant="success">{message}</Alert>}
      {etat === "erreur" && <Alert variant="error">{message}</Alert>}
      <Label>Nouveau mot de passe provisoire</Label>
      <Input
        type="text"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Au moins 8 caractères"
        autoComplete="new-password"
      />
      <Button type="button" variant="secondary" disabled={etat === "envoi"} onClick={renvoyer}>
        {etat === "envoi" ? "Enregistrement…" : "Définir ce mot de passe"}
      </Button>
    </div>
  );
}
