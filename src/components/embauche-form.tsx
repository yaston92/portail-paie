"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";
import type { Embauche } from "@/lib/types";

interface Props {
  /** Si fourni : re-soumission d'une embauche retournée (pièces déjà déposées facultatives). */
  embauche?: Embauche;
}

export function EmbaucheForm({ embauche }: Props) {
  const router = useRouter();
  const [typeContrat, setTypeContrat] = useState(embauche?.type_contrat ?? "");
  const [dateDebut, setDateDebut] = useState(embauche?.date_debut ?? "");
  const [salaireMinimum, setSalaireMinimum] = useState(
    embauche?.salaire_minimum ?? false
  );
  const [manquants, setManquants] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setManquants([]);
    setErreur(null);
    setEnvoi(true);

    const form = new FormData(e.currentTarget);
    form.set("salaire_minimum", salaireMinimum ? "true" : "false");
    if (embauche) form.set("embauche_id", embauche.id);

    const res = await fetch("/api/embauches", { method: "POST", body: form });
    const json = await res.json();
    setEnvoi(false);

    if (!res.ok) {
      if (json.manquants) {
        setManquants(json.manquants);
      } else {
        setErreur(json.error ?? "Échec de l'envoi.");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      toastError(
        json.manquants
          ? "Complétez les éléments manquants."
          : json.error ?? "Échec de l'envoi."
      );
      return;
    }
    toastSuccess("Embauche envoyée au cabinet");
    router.push("/client/embauches?envoye=1");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {manquants.length > 0 && (
        <Alert variant="error">
          <p className="font-semibold">
            Envoi impossible : complétez les éléments suivants.
          </p>
          <ul className="list-disc ml-5 mt-1">
            {manquants.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}
      {erreur && <Alert variant="error">{erreur}</Alert>}
      {embauche?.commentaire_retour && (
        <Alert variant="warning">
          <span className="font-semibold">Retour du cabinet :</span>{" "}
          {embauche.commentaire_retour}
          <p className="mt-2 text-sm">
            Les champs ci-dessous sont préremplis. Modifiez uniquement ce qui est
            demandé. Les pièces déjà déposées sont conservées si vous n&apos;en
            renvoyez pas de nouvelles.
          </p>
        </Alert>
      )}

      <fieldset className="space-y-3">
        <legend className="font-semibold text-gray-800 mb-1">Salarié</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Nom *</Label>
            <Input name="nom" required defaultValue={embauche?.nom ?? ""} />
          </div>
          <div>
            <Label>Prénom *</Label>
            <Input name="prenom" required defaultValue={embauche?.prenom ?? ""} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-gray-800 mb-1">
          Pièces justificatives
        </legend>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>
              Pièce d&apos;identité : recto {embauche ? "(déjà déposée)" : "*"}
            </Label>
            <Input
              name="piece_identite_recto"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              required={!embauche}
            />
          </div>
          <div>
            <Label>
              Pièce d&apos;identité : verso {embauche ? "(déjà déposée)" : "*"}
            </Label>
            <Input
              name="piece_identite_verso"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              required={!embauche}
            />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Carte vitale</Label>
            <Input
              name="carte_vitale"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            />
          </div>
          <div>
            <Label>N° de sécurité sociale</Label>
            <Input
              name="nir"
              inputMode="numeric"
              placeholder="13 ou 15 chiffres"
              defaultValue={embauche?.nir ?? ""}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Formats acceptés : PDF, PNG ou JPG. Le n° de sécurité sociale est
          optionnel.
        </p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-gray-800 mb-1">Contrat</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Date de début *</Label>
            <Input
              name="date_debut"
              type="date"
              required
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
            />
          </div>
          <div>
            <Label>Type de contrat *</Label>
            <Select
              name="type_contrat"
              required
              value={typeContrat}
              onChange={(e) => setTypeContrat(e.target.value)}
            >
              <option value="">- Choisir -</option>
              <option value="cdi">CDI</option>
              <option value="cdd">CDD</option>
            </Select>
          </div>
          {typeContrat === "cdd" && (
            <div>
              <Label>Date de fin *</Label>
              <Input
                name="cdd_duree"
                type="date"
                required
                min={dateDebut || undefined}
                defaultValue={
                  embauche?.cdd_duree && /^\d{4}-\d{2}-\d{2}$/.test(embauche.cdd_duree)
                    ? embauche.cdd_duree
                    : ""
                }
              />
            </div>
          )}
          <div>
            <Label>Durée hebdomadaire de travail (heures) *</Label>
            <Input
              name="duree_hebdo"
              type="number"
              step="0.5"
              min="1"
              required
              defaultValue={embauche?.duree_hebdo ?? ""}
            />
          </div>
          <div>
            <Label>Poste occupé *</Label>
            <Input name="poste" required defaultValue={embauche?.poste ?? ""} />
          </div>
          <div>
            <Label>Salaire brut mensuel (€) {salaireMinimum ? "" : "*"}</Label>
            <Input
              name="salaire"
              type="number"
              step="0.01"
              min="0"
              disabled={salaireMinimum}
              required={!salaireMinimum}
              defaultValue={embauche?.salaire ?? ""}
            />
            <label className="flex items-center gap-2 text-sm mt-2">
              <input
                type="checkbox"
                checked={salaireMinimum}
                onChange={(e) => setSalaireMinimum(e.target.checked)}
              />
              Salaire minimum (SMIC / minimum conventionnel)
            </label>
          </div>
        </div>
      </fieldset>

      <div>
        <Label>Note libre</Label>
        <Textarea
          name="note"
          placeholder="Précisions utiles : mutuelle, avantages, particularités du contrat…"
          defaultValue={embauche?.note ?? ""}
        />
      </div>

      <Button type="submit" disabled={envoi}>
        {envoi
          ? "Envoi en cours…"
          : embauche
            ? "Renvoyer l'embauche complétée"
            : "Envoyer la déclaration d'embauche"}
      </Button>
    </form>
  );
}
