"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";

/** Suppression du compte (Play Store / RGPD), avec confirmation. */
export function SupprimerCompte() {
  const router = useRouter();
  const [etape, setEtape] = useState<"idle" | "confirme">("idle");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function supprimer() {
    setErreur(null);
    setBusy(true);
    try {
      const res = await fetch("/api/profil", { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErreur(json.error || "Suppression impossible.");
        setBusy(false);
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setErreur("Suppression impossible. Réessayez.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 space-y-3">
      <h2 className="font-semibold text-gray-900">Supprimer mon compte</h2>
      <p className="text-sm text-gray-600">
        Cette action est définitive : vous ne pourrez plus vous connecter. Les
        dossiers, salariés et bulletins conservés par le cabinet ou
        l&apos;employeur ne sont pas effacés (obligations légales de paie).
      </p>
      {erreur && <Alert variant="error">{erreur}</Alert>}
      {etape === "idle" ? (
        <Button type="button" variant="danger" onClick={() => setEtape("confirme")}>
          Supprimer mon compte
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() => void supprimer()}
          >
            {busy ? "Suppression…" : "Confirmer la suppression"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => setEtape("idle")}
          >
            Annuler
          </Button>
        </div>
      )}
    </div>
  );
}
