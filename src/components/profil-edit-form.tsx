"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

export function ProfilEditForm({
  nomInitial,
  prenomInitial,
  emailInitial,
  telephoneInitial,
}: {
  nomInitial: string;
  prenomInitial: string;
  emailInitial: string;
  telephoneInitial: string | null;
}) {
  const router = useRouter();
  const [nom, setNom] = useState(nomInitial);
  const [prenom, setPrenom] = useState(prenomInitial);
  const [email, setEmail] = useState(emailInitial);
  const [telephone, setTelephone] = useState(telephoneInitial ?? "");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    if (!nom.trim()) {
      setErreur("Le nom est obligatoire.");
      return;
    }
    if (!email.trim()) {
      setErreur("L'email est obligatoire.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profil", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nom: nom.trim(),
          prenom: prenom.trim(),
          email: email.trim(),
          telephone: telephone.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreur(json.error ?? "Enregistrement impossible");
        toastError(json.error ?? "Enregistrement impossible");
        return;
      }
      if (json.emailPending) {
        // Remettre l'email actuel affiché tant que la nouvelle adresse n'est pas confirmée
        setEmail(json.profile?.email ?? emailInitial);
        const msg = `Un email d'activation a été envoyé à ${json.emailPendingAddress}. Votre adresse actuelle reste active jusqu'à confirmation.`;
        setInfo(msg);
        toastSuccess(msg);
      } else {
        toastSuccess("Profil mis à jour");
      }
      router.refresh();
    } catch {
      setErreur("Enregistrement impossible");
      toastError("Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void enregistrer(e)} className="space-y-3 max-w-md">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      {info && <Alert variant="success">{info}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Nom *</Label>
          <Input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            autoComplete="family-name"
          />
        </div>
        <div>
          <Label>Prénom</Label>
          <Input
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            autoComplete="given-name"
          />
        </div>
      </div>
      <div>
        <Label>Email *</Label>
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="email"
        />
        <p className="text-xs text-gray-500 mt-1">
          Un email d&apos;activation sera envoyé à la nouvelle adresse. L&apos;adresse
          actuelle reste active tant que vous n&apos;avez pas confirmé.
        </p>
      </div>
      <div>
        <Label>Téléphone</Label>
        <Input
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          type="tel"
          autoComplete="tel"
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
