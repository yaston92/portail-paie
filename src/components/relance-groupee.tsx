"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

export function RelanceGroupee({
  mois,
  collaborateurId,
  nbEnRetard,
}: {
  mois: string;
  collaborateurId?: string;
  nbEnRetard: number;
}) {
  const router = useRouter();
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok" | "erreur">("idle");
  const [nb, setNb] = useState(0);

  async function relancer() {
    setEtat("envoi");
    const res = await fetch("/api/campagnes/relance-groupee", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mois, collaborateur_id: collaborateurId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setEtat("erreur");
      toastError("Échec des relances");
      return;
    }
    setNb(json.relancees);
    setEtat("ok");
    toastSuccess(`${json.relancees} relance(s) envoyée(s)`);
    router.refresh();
  }

  if (etat === "ok") {
    return (
      <span className="text-sm text-green-700 font-medium">
        {nb} relance(s) envoyée(s)
      </span>
    );
  }
  return (
    <Button
      variant="secondary"
      onClick={relancer}
      disabled={etat === "envoi" || nbEnRetard === 0}
    >
      {etat === "envoi"
        ? "Envoi…"
        : etat === "erreur"
          ? "Erreur : réessayer"
          : `Relance groupée (${nbEnRetard} en attente)`}
    </Button>
  );
}
