"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

/** Exercice / levée du droit d'opposition au bulletin dématérialisé. */
export function OppositionToggle({ opposition }: { opposition: boolean }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function basculer() {
    setErreur(null);
    setEnvoi(true);
    const res = await fetch("/api/salarie/opposition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ opposition: !opposition }),
    });
    setEnvoi(false);
    if (!res.ok) {
      setErreur("Échec de l'enregistrement. Réessayez.");
      toastError("Échec de l'enregistrement. Réessayez.");
      return;
    }
    toastSuccess(
      !opposition
        ? "Opposition au bulletin dématérialisé activée"
        : "Opposition levée"
    );
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      <Button
        variant={opposition ? "primary" : "danger"}
        onClick={basculer}
        disabled={envoi}
      >
        {envoi
          ? "Enregistrement…"
          : opposition
            ? "Lever mon opposition (repasser au bulletin dématérialisé)"
            : "M'opposer au bulletin dématérialisé"}
      </Button>
    </div>
  );
}
