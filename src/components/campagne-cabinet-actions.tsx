"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

/** Ouverture des campagnes du mois pour tous les dossiers (ou une sélection). */
export function OuvrirCampagnes({
  mois,
  dossierIds,
  libelle = "Ouvrir les campagnes du mois",
}: {
  mois: string;
  dossierIds?: string[];
  libelle?: string;
}) {
  const router = useRouter();
  const [dateLimite, setDateLimite] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function ouvrir(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setMessage(null);
    setEnvoi(true);
    const res = await fetch("/api/campagnes/ouvrir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mois,
        date_limite: dateLimite,
        dossier_ids: dossierIds,
      }),
    });
    const json = await res.json();
    setEnvoi(false);
    if (!res.ok) {
      setErreur(json.error ?? "Échec de l'ouverture.");
      toastError(json.error ?? "Échec de l'ouverture.");
      return;
    }
    const ok = `${json.ouvertes} campagne(s) ouverte(s)${json.deja > 0 ? `, ${json.deja} déjà existante(s)` : ""}. Les clients ont été notifiés.`;
    setMessage(ok);
    toastSuccess(ok);
    router.refresh();
  }

  return (
    <form onSubmit={ouvrir} className="space-y-3">
      {message && <Alert variant="success">{message}</Alert>}
      {erreur && <Alert variant="error">{erreur}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Date limite de retour *</Label>
          <Input
            type="date"
            required
            value={dateLimite}
            onChange={(e) => setDateLimite(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={envoi}>
          {envoi ? "Ouverture…" : libelle}
        </Button>
      </div>
    </form>
  );
}

/**
 * Ouverture d'une campagne pour un seul dossier (ligne du tableau).
 * Affiche d'abord un lien, puis la date limite au clic.
 */
export function OuvrirCampagneIndividuelle({
  mois,
  dossierId,
  sigle,
}: {
  mois: string;
  dossierId: string;
  sigle: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [dateLimite, setDateLimite] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function confirmer() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLimite)) {
      setErreur("Indiquez une date limite.");
      return;
    }
    setErreur(null);
    setEnvoi(true);
    const res = await fetch("/api/campagnes/ouvrir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mois,
        date_limite: dateLimite,
        dossier_ids: [dossierId],
      }),
    });
    const json = await res.json();
    setEnvoi(false);
    if (!res.ok) {
      setErreur(json.error ?? "Échec");
      toastError(json.error ?? "Échec");
      return;
    }
    if (json.ouvertes === 0) {
      setErreur("Campagne déjà ouverte pour ce dossier.");
      toastError("Campagne déjà ouverte pour ce dossier.");
      return;
    }
    toastSuccess(`Campagne ouverte pour ${sigle}`);
    router.refresh();
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="text-sm text-blue-700 hover:underline"
        title={`Ouvrir la campagne pour ${sigle}`}
      >
        Ouvrir
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1 items-start">
      <span className="inline-flex flex-wrap items-center gap-2">
        <input
          type="date"
          required
          value={dateLimite}
          onChange={(e) => setDateLimite(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs"
          aria-label="Date limite"
        />
        <button
          type="button"
          onClick={() => void confirmer()}
          disabled={envoi}
          className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
        >
          {envoi ? "…" : "OK"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOuvert(false);
            setErreur(null);
          }}
          className="text-xs text-gray-500 hover:underline"
        >
          Annuler
        </button>
      </span>
      {erreur && <span className="text-xs text-red-600">{erreur}</span>}
    </span>
  );
}

/** Relance manuelle d'une campagne ouverte. */
export function RelancerCampagne({ campagneId }: { campagneId: string }) {
  const router = useRouter();
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok" | "erreur">("idle");

  async function relancer() {
    setEtat("envoi");
    const res = await fetch(`/api/campagnes/${campagneId}/relancer`, {
      method: "POST",
    });
    setEtat(res.ok ? "ok" : "erreur");
    if (res.ok) {
      toastSuccess("Relance envoyée");
      router.refresh();
    } else {
      toastError("Échec de la relance");
    }
  }

  if (etat === "ok") {
    return <span className="text-sm text-green-700">Relance envoyée</span>;
  }
  return (
    <button
      type="button"
      onClick={relancer}
      disabled={etat === "envoi"}
      className="text-sm text-blue-700 hover:underline disabled:opacity-50"
    >
      {etat === "envoi" ? "Envoi…" : etat === "erreur" ? "Erreur : réessayer" : "Relancer"}
    </button>
  );
}

/** Ouvre de nouveau une campagne déjà envoyée / clôturée (corrections client). */
export function RouvrirCampagne({
  campagneId,
  libelle = "Ouvrir de nouveau",
}: {
  campagneId: string;
  libelle?: string;
}) {
  const router = useRouter();
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok" | "erreur">("idle");

  async function ouvrirDeNouveau() {
    if (
      !confirm(
        "Ouvrir de nouveau cette campagne ? Le client pourra modifier les variables puis les renvoyer."
      )
    ) {
      return;
    }
    setEtat("envoi");
    const res = await fetch(`/api/campagnes/${campagneId}/rouvrir`, {
      method: "POST",
    });
    setEtat(res.ok ? "ok" : "erreur");
    if (res.ok) {
      toastSuccess("Saisie des variables de nouveau ouverte");
      router.refresh();
    } else {
      toastError("Impossible d'ouvrir de nouveau la saisie");
    }
  }

  if (etat === "ok") {
    return (
      <span className="text-sm text-green-700">
        Saisie des variables de nouveau ouverte
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={ouvrirDeNouveau}
      disabled={etat === "envoi"}
      className="text-sm text-blue-700 hover:underline disabled:opacity-50"
    >
      {etat === "envoi"
        ? "Ouverture…"
        : etat === "erreur"
          ? "Erreur : réessayer"
          : libelle}
    </button>
  );
}
