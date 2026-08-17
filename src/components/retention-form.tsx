"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Label } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

interface Reglage {
  type_document: string;
  duree_mois: number;
  description: string | null;
}

const LABELS: Record<string, string> = {
  piece_identite: "Pièces d'identité",
  carte_vitale: "Cartes vitales",
  bulletin: "Bulletins de paie",
  fin_contrat: "Documents de fin de contrat",
  note_piece: "Pièces jointes des notes",
};

/** Durées de conservation (même UX que l'app mobile RGPD). */
export function RetentionForm({ reglages }: { reglages: Reglage[] }) {
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const r of reglages) map[r.type_document] = String(r.duree_mois);
    return map;
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function enregistrer(type: string) {
    const duree = Number(valeurs[type]);
    if (!Number.isFinite(duree) || duree < 1) {
      toastError("Durée invalide");
      return;
    }
    setBusy(type);
    const supabase = createClient();
    const { error } = await supabase
      .from("retention_settings")
      .update({ duree_mois: duree })
      .eq("type_document", type);
    setBusy(null);
    if (error) {
      toastError(error.message || "Échec de l'enregistrement.");
      return;
    }
    toastSuccess(
      `Enregistré : ${LABELS[type] ?? type} : ${duree} mois`
    );
  }

  if (reglages.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-6 text-center">
        Aucun paramètre.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {reglages.map((r) => (
        <div
          key={r.type_document}
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <p className="font-semibold text-gray-900">
            {LABELS[r.type_document] ?? r.type_document}
          </p>
          {r.description && (
            <p className="text-sm text-gray-500 mt-1">{r.description}</p>
          )}
          <div className="mt-3">
            <Label>Durée (mois)</Label>
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={valeurs[r.type_document] ?? ""}
              onChange={(e) =>
                setValeurs((prev) => ({
                  ...prev,
                  [r.type_document]: e.target.value,
                }))
              }
              className="mb-3"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={busy === r.type_document}
              onClick={() => void enregistrer(r.type_document)}
            >
              {busy === r.type_document ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
