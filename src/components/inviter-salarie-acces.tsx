"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Input, Label } from "@/components/ui";
import type { AccesSalarieStatut } from "@/lib/acces-salarie";
import { toastError, toastSuccess } from "@/lib/toast";

interface Props {
  salarieId: string;
  emailInitial?: string | null;
  accesInitial: {
    statut: AccesSalarieStatut;
    email: string | null;
  };
}

/** Invitation / réinvitation / changement d'email d'un salarié. */
export function InviterSalarieAcces({
  salarieId,
  emailInitial = "",
  accesInitial,
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState(emailInitial || accesInitial.email || "");
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok" | "erreur">("idle");
  const [message, setMessage] = useState("");
  const [statut, setStatut] = useState(accesInitial.statut);
  const [emailCompte, setEmailCompte] = useState(accesInitial.email);
  const [emailPending, setEmailPending] = useState<string | null>(null);
  const [modeModifier, setModeModifier] = useState(false);
  const [modeRenvoyer, setModeRenvoyer] = useState(false);

  async function envoyer(action?: "changement_email") {
    setEtat("envoi");
    setMessage("");
    const emailCible = (email.trim() || emailCompte || "").toLowerCase();
    const res = await fetch(`/api/salaries/${salarieId}/acces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: emailCible,
        ...(action ? { action } : {}),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setEtat("erreur");
      setMessage(json.error ?? "Échec de l'envoi.");
      toastError(json.error ?? "Échec de l'envoi.");
      return;
    }

    if (action === "changement_email") {
      const ok = `Lien envoyé à ${json.emailDemande}. L'adresse actuelle (${json.emailActuel}) reste active jusqu'à confirmation.`;
      setEtat("ok");
      setMessage(ok);
      toastSuccess(ok);
      setEmailPending(json.emailDemande);
      setModeModifier(false);
      setEmail("");
      router.refresh();
      return;
    }

    const ok =
      json.mode === "reinvitation"
        ? `Nouveau lien envoyé à ${emailCible}.`
        : `Invitation envoyée à ${emailCible}.`;
    setEtat("ok");
    setMessage(ok);
    toastSuccess(ok);
    setStatut("invitation_en_attente");
    setEmailCompte(emailCible);
    setModeRenvoyer(false);
    setEmail("");
    router.refresh();
  }

  const afficherFormulaireInvite =
    statut !== "actif" || modeRenvoyer || etat === "erreur";
  const afficherFormulaireModifier = statut === "actif" && modeModifier;

  return (
    <div className="space-y-2">
      {statut === "actif" && (
        <p className="text-sm">
          <Badge variant="green">Accès actif</Badge>{" "}
          <span className="text-gray-600">{emailCompte}</span>
        </p>
      )}
      {statut === "invitation_en_attente" && (
        <p className="text-sm">
          <Badge variant="amber">Invitation en attente</Badge>{" "}
          <span className="text-gray-600">{emailCompte}</span>
        </p>
      )}
      {statut === "aucun" && (
        <p className="text-xs text-gray-500">Aucun accès espace salarié.</p>
      )}

      {emailPending && (
        <Alert variant="success">
          Lien envoyé à <strong>{emailPending}</strong> : l&apos;adresse{" "}
          <strong>{emailCompte}</strong> reste active jusqu&apos;à confirmation.
        </Alert>
      )}

      {etat === "ok" && !emailPending && <Alert variant="success">{message}</Alert>}
      {etat === "erreur" && <Alert variant="error">{message}</Alert>}

      {afficherFormulaireInvite && !afficherFormulaireModifier && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="salarie@exemple.fr"
            />
          </div>
          <Button type="button" onClick={() => void envoyer()} disabled={etat === "envoi"}>
            {etat === "envoi"
              ? "Envoi…"
              : statut === "aucun"
                ? "Inviter"
                : "Renvoyer le lien"}
          </Button>
          {modeRenvoyer && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModeRenvoyer(false);
                setEtat("idle");
                setMessage("");
              }}
            >
              Annuler
            </Button>
          )}
        </div>
      )}

      {afficherFormulaireModifier && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-600">
            Un lien sera envoyé à la nouvelle adresse. Tant qu&apos;il n&apos;est
            pas activé, <strong>{emailCompte}</strong> reste l&apos;adresse de
            connexion.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1">
              <Label>Nouvelle adresse email</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nouvelle@exemple.fr"
              />
            </div>
            <Button
              type="button"
              onClick={() => void envoyer("changement_email")}
              disabled={etat === "envoi"}
            >
              {etat === "envoi" ? "Envoi…" : "Envoyer le lien"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModeModifier(false);
                setEmail("");
                setEtat("idle");
                setMessage("");
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {statut === "actif" && !modeModifier && !modeRenvoyer && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="text-xs text-blue-700 hover:underline"
            onClick={() => {
              setModeModifier(true);
              setModeRenvoyer(false);
              setEmail("");
              setEtat("idle");
              setMessage("");
            }}
          >
            Modifier l&apos;adresse
          </button>
          <button
            type="button"
            className="text-xs text-blue-700 hover:underline"
            onClick={() => {
              setModeRenvoyer(true);
              setModeModifier(false);
              setEmail(emailCompte || "");
              setEtat("idle");
              setMessage("");
            }}
          >
            Renvoyer un lien d&apos;activation
          </button>
        </div>
      )}
    </div>
  );
}
