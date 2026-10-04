"use client";

import { useRef, useState } from "react";
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
  const [salaireType, setSalaireType] = useState<"brut" | "net">(
    embauche?.salaire_type === "brut" ? "brut" : "net"
  );
  const [accompagnement, setAccompagnement] = useState(
    embauche?.accompagnement ?? false
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
    form.set("salaire_type", salaireType);
    form.set("accompagnement", accompagnement ? "true" : "false");
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

      <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={accompagnement}
          onChange={(e) => setAccompagnement(e.target.checked)}
        />
        <span>
          <span className="font-semibold text-gray-900">
            Je ne sais pas, et je souhaite être rappelé pour un accompagnement
          </span>
          <span className="block text-gray-600 mt-1">
            Vous pouvez quand même indiquer ce que vous savez et joindre les pièces
            (photo ou fichier). Le cabinet vous rappelle pour le reste.
          </span>
        </span>
      </label>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-gray-800 mb-1">
          Pièces justificatives
        </legend>
        <div className="grid sm:grid-cols-2 gap-3">
          <ChampPiece
            name="piece_identite_recto"
            label={`Pièce d'identité : recto${accompagnement || embauche ? "" : " *"}`}
            required={!accompagnement && !embauche}
          />
          <ChampPiece
            name="piece_identite_verso"
            label={`Pièce d'identité : verso${accompagnement || embauche ? "" : " *"}`}
            required={!accompagnement && !embauche}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <ChampPiece name="carte_vitale" label="Carte vitale" />
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
            <Label>Date de début{accompagnement ? "" : " *"}</Label>
            <Input
              name="date_debut"
              type="date"
              required={!accompagnement}
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
            />
          </div>
          <div>
            <Label>Type de contrat{accompagnement ? "" : " *"}</Label>
            <Select
              name="type_contrat"
              required={!accompagnement}
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
              <Label>Date de fin{accompagnement ? "" : " *"}</Label>
              <Input
                name="cdd_duree"
                type="date"
                required={!accompagnement}
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
            <Label>
              Durée hebdomadaire{accompagnement ? "" : " *"}
            </Label>
            <Input
              name="duree_hebdo"
              type="number"
              step="0.5"
              min="1"
              required={!accompagnement}
              placeholder="ex. 35"
              defaultValue={embauche?.duree_hebdo ?? ""}
            />
            <p className="text-xs text-gray-500 mt-1">
              Nombre d&apos;heures travaillées chaque semaine. Un temps plein est en
              général 35 heures.
            </p>
          </div>
          <div>
            <Label>Poste occupé{accompagnement ? "" : " *"}</Label>
            <Input
              name="poste"
              required={!accompagnement}
              defaultValue={embauche?.poste ?? ""}
            />
          </div>
          <div>
            <Label>
              Salaire mensuel (€) {salaireMinimum || accompagnement ? "" : "*"}
            </Label>
            <Input
              name="salaire"
              type="number"
              step="0.01"
              min="0"
              disabled={salaireMinimum}
              required={!salaireMinimum && !accompagnement}
              defaultValue={embauche?.salaire ?? ""}
            />
            {!salaireMinimum && (
              <div className="flex gap-4 text-sm mt-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="salaire_type_ui"
                    checked={salaireType === "net"}
                    onChange={() => setSalaireType("net")}
                  />
                  Net
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="salaire_type_ui"
                    checked={salaireType === "brut"}
                    onChange={() => setSalaireType("brut")}
                  />
                  Brut
                </label>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              La plupart des clients parlent en net. Indiquez le montant tel que vous
              le connaissez.
            </p>
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

function poserFichier(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Photo (caméra sur téléphone) ou fichier, un seul champ envoyé. */
function ChampPiece({
  name,
  label,
  required = false,
}: {
  name: string;
  label: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nomFichier, setNomFichier] = useState<string | null>(null);

  return (
    <div>
      <Label>{label}</Label>
      <input
        ref={inputRef}
        name={name}
        type="file"
        required={required}
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        className="sr-only"
        onChange={(e) => setNomFichier(e.target.files?.[0]?.name ?? null)}
      />
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
          Prendre une photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && inputRef.current) poserFichier(inputRef.current, file);
              e.target.value = "";
            }}
          />
        </label>
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
          Choisir un fichier
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && inputRef.current) poserFichier(inputRef.current, file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {nomFichier ?? "PDF, PNG ou JPG"}
      </p>
    </div>
  );
}
