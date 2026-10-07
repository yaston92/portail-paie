"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

/** Le cabinet a pris en compte les variables : le statut passe à Traité. */
export function TraiterCampagneButton({ campagneId }: { campagneId: string }) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);

  async function traiter() {
    setEnvoi(true);
    const res = await fetch(`/api/campagnes/${campagneId}/traiter`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setEnvoi(false);
    if (!res.ok) {
      toastError(json.error || "Impossible de marquer la campagne comme traitée.");
      return;
    }
    toastSuccess("Campagne traitée");
    router.refresh();
  }

  return (
    <Button variant="secondary" onClick={traiter} disabled={envoi}>
      {envoi ? "…" : "Marquer comme traité"}
    </Button>
  );
}
