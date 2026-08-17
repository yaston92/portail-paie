"use client";

import { useState } from "react";
import { Alert, Button, Input, Label } from "@/components/ui";
import {
  JOURS_SEMAINE,
  LABEL_JOUR_COURT,
  normaliserHoraires,
  sommeHebdo,
  type HorairesSemaine,
} from "@/lib/horaires";
import { toastError, toastSuccess } from "@/lib/toast";

/** Saisie des heures de travail lun–dim pour un salarié (client). */
export function HorairesSalarieForm({
  salarieId,
  dureeHebdo,
  horairesInitial,
  compact = false,
}: {
  salarieId: string;
  dureeHebdo: number | null;
  horairesInitial: unknown;
  compact?: boolean;
}) {
  const [valeurs, setValeurs] = useState<HorairesSemaine>(() =>
    normaliserHoraires(horairesInitial, dureeHebdo)
  );
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const total = sommeHebdo(valeurs);

  async function enregistrer() {
    setErreur(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/client/salaries/${salarieId}/horaires`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(valeurs),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErreur(json.error || "Enregistrement impossible");
        toastError(json.error || "Enregistrement impossible");
        setBusy(false);
        return;
      }
      toastSuccess(`Horaires enregistrés (${total} h / semaine)`);
    } catch {
      setErreur("Réseau indisponible.");
      toastError("Réseau indisponible.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <p className="text-xs text-gray-500">
          Indiquez les heures travaillées chaque jour. Le planning de présence
          s&apos;appuie sur ces horaires.
        </p>
      )}
      {erreur && <Alert variant="error">{erreur}</Alert>}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {JOURS_SEMAINE.map((j) => (
          <div key={j}>
            <Label className="text-xs">{LABEL_JOUR_COURT[j]}</Label>
            <Input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={valeurs[j]}
              onChange={(e) => {
                const n = Number(e.target.value.replace(",", "."));
                setValeurs((prev) => ({
                  ...prev,
                  [j]: Number.isFinite(n) ? Math.min(24, Math.max(0, n)) : 0,
                }));
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          Total : <span className="font-medium">{total} h</span> / semaine
        </p>
        <Button type="button" disabled={busy} onClick={enregistrer}>
          {busy ? "Enregistrement…" : "Enregistrer les horaires"}
        </Button>
      </div>
    </div>
  );
}
