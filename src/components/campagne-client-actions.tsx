"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardBody } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

/** Question d'entrée de la campagne : « vos paies sont-elles les mêmes que d'habitude ? » */
export function QuestionIdentiques({
  campagneId,
  motifBlocage,
}: {
  campagneId: string;
  motifBlocage?: string | null;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<"oui" | "non" | null>(null);

  async function repondre(identiques: boolean) {
    setErreur(null);
    setEnvoi(identiques ? "oui" : "non");
    const res = await fetch(`/api/campagnes/${campagneId}/reponse-identiques`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identiques }),
    });
    if (!res.ok) {
      const json = await res.json();
      setErreur(json.error ?? "Échec de l'enregistrement.");
      toastError(json.error ?? "Échec de l'enregistrement.");
      setEnvoi(null);
      return;
    }
    if (identiques) {
      toastSuccess("Paies identiques confirmées : campagne terminée");
    }
    router.refresh();
  }

  return (
    <Card>
      <CardBody className="text-center py-10">
        <h2 className="text-xl font-semibold mb-2">
          Vos paies sont-elles les mêmes que d&apos;habitude ?
        </h2>
        <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
          {motifBlocage
            ? motifBlocage
            : "Si oui, la campagne du mois est transmise au cabinet et reste en cours jusqu'à son traitement. Les congés payés déjà validés pour le mois restent transmis. Sinon, vous saisirez les variables salarié par salarié."}
        </p>
        {erreur && (
          <div className="mb-4 max-w-md mx-auto">
            <Alert variant="error">{erreur}</Alert>
          </div>
        )}
        <div className="flex justify-center gap-4">
          {!motifBlocage && (
            <Button
              onClick={() => repondre(true)}
              disabled={envoi !== null}
              className="px-8 py-3 text-base"
            >
              {envoi === "oui" ? "Envoi…" : "Oui, tout est identique"}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => repondre(false)}
            disabled={envoi !== null}
            className="px-8 py-3 text-base"
          >
            {envoi === "non" ? "Ouverture…" : "Non, je saisis les variables"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

interface Incomplet {
  id: string;
  nom: string;
}

/** Bouton d'envoi définitif, avec écran de blocage listant les salariés incomplets. */
export function EnvoyerCampagne({
  campagneId,
  incompletsInitiaux,
  completes,
  total,
}: {
  campagneId: string;
  incompletsInitiaux: Incomplet[];
  completes: number;
  total: number;
}) {
  const router = useRouter();
  const [incomplets, setIncomplets] = useState<Incomplet[]>(incompletsInitiaux);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [tentative, setTentative] = useState(false);

  async function envoyer() {
    setErreur(null);
    setEnvoi(true);
    setTentative(true);
    const res = await fetch(`/api/campagnes/${campagneId}/envoyer`, {
      method: "POST",
    });
    const json = await res.json();
    setEnvoi(false);
    if (!res.ok) {
      if (json.incomplets) {
        setIncomplets(json.incomplets);
      } else {
        setErreur(json.error ?? "Échec de l'envoi.");
        toastError(json.error ?? "Échec de l'envoi.");
      }
      return;
    }
    toastSuccess("Variables transmises au cabinet");
    router.refresh();
  }

  const bloque = incomplets.length > 0;

  return (
    <div className="space-y-3">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      {tentative && bloque && (
        <Alert variant="error">
          <p className="font-semibold">
            Envoi bloqué : {incomplets.length} salarié(s) à compléter.
          </p>
          <ul className="list-disc ml-5 mt-1">
            {incomplets.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/client/variables/${campagneId}/salarie/${s.id}`}
                  className="underline"
                >
                  {s.nom}
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="flex items-center gap-4">
        <Button onClick={envoyer} disabled={envoi}>
          {envoi ? "Envoi…" : "Valider et envoyer au cabinet"}
        </Button>
        <span className="text-sm text-gray-600">
          {completes} salarié{completes > 1 ? "s" : ""} sur {total} complété
          {completes > 1 ? "s" : ""}
        </span>
      </div>
      <p className="text-xs text-gray-500">
        Après envoi, la saisie sera verrouillée et un récapitulatif PDF sera
        généré.
      </p>
    </div>
  );
}
