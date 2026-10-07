"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

/** Passe l'arrêt dans l'historique une fois pris en compte par le cabinet. */
export function TraiterArretButton({ arretId }: { arretId: string }) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);

  async function traiter() {
    setEnvoi(true);
    const res = await fetch(`/api/arrets-maladie/${arretId}/traiter`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setEnvoi(false);
    if (!res.ok) {
      toastError(json.error || "Impossible de marquer l'arrêt comme traité.");
      return;
    }
    toastSuccess("Arrêt traité");
    router.refresh();
  }

  return (
    <Button variant="secondary" onClick={traiter} disabled={envoi}>
      {envoi ? "…" : "Marquer comme traité"}
    </Button>
  );
}
