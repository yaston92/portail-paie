"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DatePickerField } from "@/components/date-picker-field";
import { Alert, Button, Input, Label } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { toastError, toastSuccess } from "@/lib/toast";
import type { DemandeConge } from "@/lib/types";

const STATUT_LABEL: Record<DemandeConge["statut"], string> = {
  en_attente: "En attente",
  validee: "Validée",
  refusee: "Refusée",
  annulee: "Annulée",
};

export function DemandeCongeForm({
  demandesInitiales,
}: {
  demandesInitiales: DemandeConge[];
}) {
  const router = useRouter();
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [demandes, setDemandes] = useState(demandesInitiales);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!debut || !fin) {
      setErreur("Choisissez les dates de début et de fin.");
      return;
    }
    if (fin < debut) {
      setErreur("La date de fin doit être après la date de début.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/salarie/demandes-conge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_debut: debut,
          date_fin: fin,
          commentaire: commentaire || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      } & DemandeConge;
      if (!res.ok) {
        setErreur(json.error || "Envoi impossible");
        toastError(json.error || "Envoi impossible");
        setBusy(false);
        return;
      }
      setDemandes((prev) => [json as DemandeConge, ...prev]);
      setDebut("");
      setFin("");
      setCommentaire("");
      toastSuccess("Demande envoyée : employeur notifié");
      router.refresh();
    } catch {
      setErreur("Réseau indisponible.");
      toastError("Réseau indisponible.");
    }
    setBusy(false);
  }

  async function annuler(id: string) {
    setBusy(true);
    setErreur(null);
    try {
      const res = await fetch(`/api/salarie/demandes-conge/${id}/annuler`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      } & DemandeConge;
      if (!res.ok) {
        setErreur(json.error || "Annulation impossible");
        toastError(json.error || "Annulation impossible");
        setBusy(false);
        return;
      }
      setDemandes((prev) =>
        prev.map((d) => (d.id === id ? (json as DemandeConge) : d))
      );
      toastSuccess("Demande annulée");
      router.refresh();
    } catch {
      setErreur("Réseau indisponible.");
      toastError("Réseau indisponible.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">Demander des congés payés</h3>
      {erreur && <Alert variant="error">{erreur}</Alert>}
      <form onSubmit={soumettre} className="grid gap-3 sm:grid-cols-2">
        <DatePickerField
          label="Du"
          value={debut}
          required
          min={new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })}
          onChange={(v) => {
            setDebut(v);
            if (fin && fin < v) setFin(v);
          }}
        />
        <DatePickerField
          label="Au"
          value={fin}
          required
          min={
            debut ||
            new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })
          }
          onChange={setFin}
        />
        <div className="sm:col-span-2">
          <Label>Commentaire (optionnel)</Label>
          <Input
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Ex. congés d'été"
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Envoi…" : "Envoyer la demande"}
          </Button>
        </div>
      </form>

      {demandes.length > 0 && (
        <ul className="divide-y divide-gray-100 text-sm">
          {demandes.map((d) => (
            <li
              key={d.id}
              className="py-3 flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <p className="font-medium">
                  {formatDate(d.date_debut)} → {formatDate(d.date_fin)}{" "}
                  <span className="text-gray-500 font-normal">
                    ({Number(d.jours)} j.)
                  </span>
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {STATUT_LABEL[d.statut]}
                  {d.commentaire ? ` : ${d.commentaire}` : ""}
                </p>
              </div>
              {d.statut === "en_attente" && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => annuler(d.id)}
                >
                  Annuler
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
