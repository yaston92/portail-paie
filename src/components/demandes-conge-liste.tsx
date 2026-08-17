"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { toastError, toastSuccess } from "@/lib/toast";
import type { DemandeConge } from "@/lib/types";

type DemandeRow = DemandeConge & {
  salaries?: { nom: string; prenom: string } | null;
};

const TONE: Record<
  DemandeConge["statut"],
  "blue" | "green" | "red" | "gray" | "amber"
> = {
  en_attente: "amber",
  validee: "green",
  refusee: "red",
  annulee: "gray",
};

const LABEL: Record<DemandeConge["statut"], string> = {
  en_attente: "En attente",
  validee: "Validée",
  refusee: "Refusée",
  annulee: "Annulée",
};

export function DemandesCongeListe({
  initiales,
}: {
  initiales: DemandeRow[];
}) {
  const router = useRouter();
  const [liste, setListe] = useState(initiales);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function decider(
    id: string,
    decision: "validee" | "refusee",
    commentaire?: string
  ) {
    setBusyId(id);
    setErreur(null);
    try {
      const res = await fetch(`/api/client/demandes-conge/${id}/decider`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, commentaire }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      } & DemandeConge;
      if (!res.ok) {
        setErreur(json.error || "Décision impossible");
        toastError(json.error || "Décision impossible");
        setBusyId(null);
        return;
      }
      setListe((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...json } : d))
      );
      toastSuccess(decision === "validee" ? "Demande validée" : "Demande refusée");
      router.refresh();
    } catch {
      setErreur("Réseau indisponible.");
      toastError("Réseau indisponible.");
    }
    setBusyId(null);
  }

  if (liste.length === 0) {
    return <p className="text-sm text-gray-500">Aucune demande pour le moment.</p>;
  }

  return (
    <div className="space-y-3">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      <ul className="divide-y divide-gray-100">
        {liste.map((d) => {
          const nom =
            d.salaries
              ? `${d.salaries.prenom} ${d.salaries.nom}`
              : "Salarié";
          return (
            <li key={d.id} className="py-4 flex flex-wrap gap-3 justify-between">
              <div>
                <p className="font-semibold text-sm">{nom}</p>
                <p className="text-sm text-gray-600 mt-0.5">
                  {formatDate(d.date_debut)} → {formatDate(d.date_fin)} ·{" "}
                  {Number(d.jours)} j.
                </p>
                {d.commentaire && (
                  <p className="text-xs text-gray-500 mt-1">{d.commentaire}</p>
                )}
                <div className="mt-2">
                  <Badge variant={TONE[d.statut]}>{LABEL[d.statut]}</Badge>
                </div>
              </div>
              {d.statut === "en_attente" && (
                <div className="flex gap-2 items-start">
                  <Button
                    disabled={busyId === d.id}
                    onClick={() => decider(d.id, "validee")}
                  >
                    Valider
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busyId === d.id}
                    onClick={() => {
                      const motif = window.prompt("Motif du refus (optionnel)") ?? undefined;
                      void decider(d.id, "refusee", motif || undefined);
                    }}
                  >
                    Refuser
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
