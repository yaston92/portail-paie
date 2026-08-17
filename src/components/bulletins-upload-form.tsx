"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label, Select } from "@/components/ui";
import { moisCourant } from "@/lib/format";
import { toastError, toastSuccess } from "@/lib/toast";

interface DossierOption {
  id: string;
  sigle: string;
  raison_sociale: string;
}

/** Upload du PDF global des paies d'un dossier, puis analyse automatique. */
export function BulletinsUploadForm({
  dossiers,
  defaultDossierId,
  defaultMois,
  hideDossierSelect = false,
}: {
  dossiers: DossierOption[];
  /** Préremplit le dossier (ex. depuis une campagne). */
  defaultDossierId?: string;
  /** Mois au format YYYY-MM-01. */
  defaultMois?: string;
  /** Masque le sélecteur dossier si un seul dossier est imposé. */
  hideDossierSelect?: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const moisDefaut = (defaultMois ?? moisCourant()).slice(0, 7);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    const form = new FormData(e.currentTarget);
    if (defaultDossierId && hideDossierSelect) {
      form.set("dossier_id", defaultDossierId);
    }
    const mois = form.get("mois") as string; // input type=month → YYYY-MM
    form.set("mois", `${mois}-01`);
    const res = await fetch("/api/bulletins/upload", {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setEnvoi(false);
    if (!res.ok) {
      const msg = json.error ?? "Échec de l'analyse du PDF.";
      setErreur(msg);
      toastError(msg);
      return;
    }
    toastSuccess("PDF analysé : contrôlez l'appariement");
    router.push(`/cabinet/bulletins/uploads/${json.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      <div
        className={
          hideDossierSelect
            ? "grid sm:grid-cols-2 gap-3"
            : "grid sm:grid-cols-3 gap-3"
        }
      >
        {!hideDossierSelect && (
          <div>
            <Label>Dossier *</Label>
            <Select
              name="dossier_id"
              required
              defaultValue={defaultDossierId ?? ""}
            >
              <option value="" disabled>
                - Choisir -
              </option>
              {dossiers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.sigle} : {d.raison_sociale}
                </option>
              ))}
            </Select>
          </div>
        )}
        {hideDossierSelect && defaultDossierId && (
          <input type="hidden" name="dossier_id" value={defaultDossierId} />
        )}
        <div>
          <Label>Mois de paie *</Label>
          <Input
            name="mois"
            type="month"
            required
            defaultValue={moisDefaut}
          />
        </div>
        <div>
          <Label>PDF global du logiciel de paie *</Label>
          <Input name="fichier" type="file" accept=".pdf" required />
        </div>
      </div>
      <Button type="submit" disabled={envoi}>
        {envoi ? "Analyse du PDF en cours…" : "Analyser et découper"}
      </Button>
    </form>
  );
}
