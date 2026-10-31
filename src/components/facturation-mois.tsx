"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

export function FacturationMois({
  mois,
  dejaFige,
}: {
  mois: string;
  dejaFige: boolean;
}) {
  const [fige, setFige] = useState(dejaFige);
  const [busy, setBusy] = useState(false);

  async function generer() {
    setBusy(true);
    try {
      const res = await fetch("/api/cabinet/facturation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mois }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; fige?: boolean };
      if (!res.ok) {
        toastError(json.error || "Export impossible");
        setBusy(false);
        return;
      }
      setFige(true);
      toastSuccess(json.fige ? "Ce mois est déjà figé" : "Fichier figé pour ce mois");
      window.location.href = `/api/cabinet/facturation?mois=${mois}`;
    } catch {
      toastError("Réseau indisponible.");
    }
    setBusy(false);
  }

  if (fige) {
    return (
      <a
        href={`/api/cabinet/facturation?mois=${mois}`}
        className="text-sm text-blue-700 hover:underline"
      >
        Télécharger le CSV figé
      </a>
    );
  }

  return (
    <Button type="button" variant="secondary" disabled={busy} onClick={() => void generer()}>
      {busy ? "Préparation…" : "Figer le CSV de facturation"}
    </Button>
  );
}
