"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ZoneFichier } from "@/components/zone-fichier";
import { Alert, Button, Input, Label, Select } from "@/components/ui";
import { moisCourant } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { toastError, toastSuccess } from "@/lib/toast";

const TAILLE_MAX_PDF = 40 * 1024 * 1024;

async function lireReponse(res: Response): Promise<{
  error?: string;
  id?: string;
  chemin?: string;
  token?: string;
}> {
  const json = (await res.json().catch(() => null)) as {
    error?: unknown;
    id?: string;
    chemin?: string;
    token?: string;
  } | null;
  const error = typeof json?.error === "string" ? json.error : undefined;
  return { error, id: json?.id, chemin: json?.chemin, token: json?.token };
}

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
    const dossierId = String(form.get("dossier_id") ?? "");
    const fichier = form.get("fichier");
    if (!(fichier instanceof File) || fichier.size < 5) {
      const msg = "Fichier PDF attendu.";
      setErreur(msg);
      toastError(msg);
      setEnvoi(false);
      return;
    }
    if (fichier.size > TAILLE_MAX_PDF) {
      const msg = "Ce PDF dépasse 40 Mo. Réexportez-le depuis le logiciel de paie.";
      setErreur(msg);
      toastError(msg);
      setEnvoi(false);
      return;
    }

    let depotId: string | null = null;
    try {
      const prep = await fetch("/api/bulletins/upload/preparer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier_id: dossierId,
          mois: `${mois}-01`,
          taille: fichier.size,
        }),
      });
      const prepare = await lireReponse(prep);
      if (!prep.ok || !prepare.id || !prepare.chemin || !prepare.token) {
        throw new Error(prepare.error ?? "Le dépôt n'a pas pu être préparé.");
      }
      depotId = prepare.id;

      const envoiFichier = await createClient()
        .storage.from("bulletins")
        .uploadToSignedUrl(prepare.chemin, prepare.token, fichier, {
          contentType: "application/pdf",
        });
      if (envoiFichier.error) {
        throw new Error("Le PDF n'a pas pu être envoyé. Réessayez.");
      }

      const lance = await fetch("/api/bulletins/upload/lancer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: prepare.id,
          dossier_id: dossierId,
          mois: `${mois}-01`,
        }),
      });
      const demarre = await lireReponse(lance);
      if (!lance.ok || !demarre.id) {
        throw new Error(demarre.error ?? "Le PDF a été reçu, mais l'enregistrement a échoué.");
      }
      depotId = null;
      toastSuccess(
        "PDF reçu. Le découpage continue : vous pouvez naviguer. Une notification arrivera."
      );
      router.refresh();
    } catch (err) {
      if (depotId) {
        await fetch("/api/bulletins/upload/annuler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: depotId, dossier_id: dossierId }),
        }).catch(() => undefined);
      }
      const msg = err instanceof Error ? err.message : "Le PDF n'a pas pu être envoyé.";
      setErreur(msg);
      toastError(msg);
    } finally {
      setEnvoi(false);
    }
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
          <ZoneFichier name="fichier" accept=".pdf,application/pdf" required />
        </div>
      </div>
      <Button type="submit" disabled={envoi}>
        {envoi ? "Envoi du PDF…" : "Analyser et découper"}
      </Button>
    </form>
  );
}
