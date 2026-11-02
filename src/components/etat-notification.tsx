"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastError } from "@/lib/toast";

/** Indique si la notification est encore à traiter. */
export function EtatNotification({
  id,
  traite,
}: {
  id: string;
  traite: boolean;
}) {
  const router = useRouter();
  const [valeur, setValeur] = useState(traite);
  const [busy, setBusy] = useState(false);

  async function choisir(suivant: boolean) {
    if (suivant === valeur || busy) return;
    setBusy(true);
    const res = await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ traite: suivant }),
    });
    setBusy(false);
    if (!res.ok) {
      toastError("Mise à jour impossible");
      return;
    }
    setValeur(suivant);
    router.refresh();
  }

  return (
    <span className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-xs">
      <button
        type="button"
        disabled={busy}
        onClick={() => void choisir(false)}
        className={`px-2 py-1 ${
          !valeur ? "bg-amber-100 font-semibold text-amber-900" : "bg-white text-gray-500"
        }`}
      >
        Pas encore
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void choisir(true)}
        className={`border-l border-gray-200 px-2 py-1 ${
          valeur ? "bg-emerald-100 font-semibold text-emerald-900" : "bg-white text-gray-500"
        }`}
      >
        Traité
      </button>
    </span>
  );
}
