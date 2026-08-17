"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { toastError, toastSuccess } from "@/lib/toast";
import type { ArretMaladie } from "@/lib/types";

/** Formulaire salarié : déclarer un arrêt + justificatif PDF/JPG/PNG. */
export function ArretMaladieSalarieForm({
  arretsInitiales,
}: {
  arretsInitiales: ArretMaladie[];
}) {
  const router = useRouter();
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [arrets, setArrets] = useState(arretsInitiales);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function soumettre(e: React.FormEvent<HTMLFormElement>) {
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
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    form.set("date_debut", debut);
    form.set("date_fin", fin);
    setBusy(true);
    try {
      const res = await fetch("/api/salarie/arrets-maladie", {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      } & ArretMaladie;
      if (!res.ok) {
        setErreur(json.error || "Envoi impossible");
        toastError(json.error || "Envoi impossible");
        setBusy(false);
        return;
      }
      setArrets((prev) => [json as ArretMaladie, ...prev]);
      setDebut("");
      setFin("");
      formEl.reset();
      toastSuccess("Arrêt maladie transmis : cabinet et employeur notifiés");
      router.refresh();
    } catch {
      setErreur("Réseau indisponible.");
      toastError("Réseau indisponible.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">Déclarer un arrêt maladie</h3>
      {erreur && <Alert variant="error">{erreur}</Alert>}
      <form onSubmit={soumettre} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Du *</Label>
          <Input
            type="date"
            required
            value={debut}
            onChange={(e) => {
              setDebut(e.target.value);
              if (fin && fin < e.target.value) setFin(e.target.value);
            }}
          />
        </div>
        <div>
          <Label>Au *</Label>
          <Input
            type="date"
            required
            value={fin}
            min={debut || undefined}
            onChange={(e) => setFin(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Justificatif (PDF, JPG ou PNG) *</Label>
          <Input
            name="justificatif"
            type="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Envoi…" : "Envoyer l'arrêt"}
          </Button>
        </div>
      </form>

      {arrets.length > 0 && (
        <ul className="divide-y divide-gray-100 text-sm">
          {arrets.map((a) => (
            <li key={a.id} className="py-2 flex flex-wrap justify-between gap-2">
              <span>
                {formatDate(a.date_debut)} → {formatDate(a.date_fin)} ·{" "}
                {Number(a.jours)} j. ouvrés
              </span>
              {a.justificatif_chemin && (
                <a
                  href={`/api/arrets-maladie/${a.id}/justificatif`}
                  className="text-blue-700 hover:underline"
                >
                  Justificatif
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Formulaire client : déclarer un arrêt pour un salarié. */
export function ArretMaladieClientForm({
  salarieId,
  salarieNom,
  compact = false,
}: {
  salarieId: string;
  salarieNom?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function soumettre(e: React.FormEvent<HTMLFormElement>) {
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
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    form.set("salarie_id", salarieId);
    form.set("date_debut", debut);
    form.set("date_fin", fin);
    setBusy(true);
    try {
      const res = await fetch("/api/client/arrets-maladie", {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErreur(json.error || "Envoi impossible");
        toastError(json.error || "Envoi impossible");
        setBusy(false);
        return;
      }
      setDebut("");
      setFin("");
      formEl.reset();
      toastSuccess(
        salarieNom
          ? `Arrêt enregistré pour ${salarieNom}`
          : "Arrêt maladie enregistré"
      );
      router.refresh();
    } catch {
      setErreur("Réseau indisponible.");
      toastError("Réseau indisponible.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={soumettre} className="space-y-3">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      {!compact && (
        <p className="text-xs text-gray-500">
          Les jours ouvrés sont injectés dans les variables de paie du mois
          concerné. Le cabinet est notifié.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Du *</Label>
          <Input
            type="date"
            required
            value={debut}
            onChange={(e) => {
              setDebut(e.target.value);
              if (fin && fin < e.target.value) setFin(e.target.value);
            }}
          />
        </div>
        <div>
          <Label>Au *</Label>
          <Input
            type="date"
            required
            value={fin}
            min={debut || undefined}
            onChange={(e) => setFin(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Justificatif (PDF, JPG, PNG) : optionnel</Label>
          <Input
            name="justificatif"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          />
        </div>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer l'arrêt maladie"}
      </Button>
    </form>
  );
}
