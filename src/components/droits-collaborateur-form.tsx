"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import {
  DROITS_COLLABORATEUR,
  type DroitsCollaborateur,
} from "@/lib/droits";
import { toastError, toastSuccess } from "@/lib/toast";

export function DroitsCollaborateurForm({
  profileId,
  cabinetId,
  droits,
  peutModifier,
}: {
  profileId: string;
  cabinetId: string;
  droits: DroitsCollaborateur;
  peutModifier: boolean;
}) {
  const router = useRouter();
  const [valeur, setValeur] = useState(droits);
  const [busy, setBusy] = useState(false);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/cabinet/membres/droits", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile_id: profileId,
          cabinet_id: cabinetId,
          droits: valeur,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toastError(json.error ?? "Enregistrement impossible");
        return;
      }
      toastSuccess("Droits enregistrés");
      router.refresh();
    } catch {
      toastError("Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={enregistrer} className="space-y-3">
      {DROITS_COLLABORATEUR.map((droit) => (
        <label key={droit.id} className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={valeur[droit.id]}
            disabled={!peutModifier || busy}
            onChange={(e) =>
              setValeur((actuel) => ({ ...actuel, [droit.id]: e.target.checked }))
            }
          />
          <span>
            <span className="font-medium text-gray-900">{droit.label}</span>
            <span className="block text-gray-500">{droit.detail}</span>
          </span>
        </label>
      ))}
      {peutModifier ? (
        <Button type="submit" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer les droits"}
        </Button>
      ) : (
        <p className="text-sm text-gray-500">
          Seul le directeur peut modifier ces droits.
        </p>
      )}
    </form>
  );
}
