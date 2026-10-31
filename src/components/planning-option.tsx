"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastError, toastSuccess } from "@/lib/toast";

export function PlanningOption({ actif }: { actif: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(actif);
  const [busy, setBusy] = useState(false);

  async function basculer() {
    setBusy(true);
    const suivant = !on;
    try {
      const res = await fetch("/api/client/planning-option", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: suivant }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toastError(json.error || "Enregistrement impossible");
        setBusy(false);
        return;
      }
      setOn(suivant);
      toastSuccess(suivant ? "Planning activé" : "Planning désactivé");
      router.refresh();
    } catch {
      toastError("Réseau indisponible.");
    }
    setBusy(false);
  }

  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={on}
        disabled={busy}
        onChange={() => void basculer()}
      />
      <span>
        <span className="font-semibold">Afficher le planning</span>
        <span className="block text-gray-500">
          Désactivé par défaut. Une fois activé, vous pouvez renseigner les heures
          par jour sur la fiche salarié. Les congés restent comptés en jours.
        </span>
      </span>
    </label>
  );
}
