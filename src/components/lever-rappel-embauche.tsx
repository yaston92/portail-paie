"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

/** Retire le badge « Rappel souhaité » une fois le client appelé. */
export function LeverRappelEmbauche({ embaucheId }: { embaucheId: string }) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);

  async function lever() {
    setEnvoi(true);
    const res = await fetch(`/api/embauches/${embaucheId}/rappel`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setEnvoi(false);
    if (!res.ok) {
      toastError(json.error || "Impossible de retirer le rappel.");
      return;
    }
    toastSuccess("Rappel retiré");
    router.refresh();
  }

  return (
    <Button variant="secondary" onClick={lever} disabled={envoi}>
      {envoi ? "Enregistrement…" : "J'ai rappelé le client"}
    </Button>
  );
}
