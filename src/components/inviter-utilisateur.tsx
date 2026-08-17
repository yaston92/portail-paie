"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label, Select } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";
import type { UserRole } from "@/lib/types";

interface Props {
  role: UserRole | "choix_cabinet";
  dossierId?: string;
  salarieId?: string;
  cabinetId?: string;
  /** Affiche aussi l'option Directeur (réservé aux directeurs côté API). */
  permettreDirecteur?: boolean;
  emailInitial?: string;
  nomInitial?: string;
  prenomInitial?: string;
  libelleBouton?: string;
}

/** Formulaire d'invitation d'un utilisateur (envoi d'un email avec lien). */
export function InviterUtilisateur({
  role,
  dossierId,
  salarieId,
  cabinetId,
  permettreDirecteur = false,
  emailInitial = "",
  nomInitial = "",
  prenomInitial = "",
  libelleBouton = "Envoyer l'invitation",
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState(emailInitial);
  const [nom, setNom] = useState(nomInitial);
  const [prenom, setPrenom] = useState(prenomInitial);
  const [roleChoisi, setRoleChoisi] = useState<UserRole>(
    role === "choix_cabinet" ? "collaborateur" : role
  );
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok" | "erreur">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEtat("envoi");
    const res = await fetch("/api/utilisateurs/inviter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        nom,
        prenom,
        role: roleChoisi,
        dossier_id: dossierId,
        salarie_id: salarieId,
        cabinet_id: cabinetId,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setEtat("erreur");
      setMessage(json.error ?? "Échec de l'invitation.");
      toastError(json.error ?? "Échec de l'invitation.");
      return;
    }
    setEtat("ok");
    const ok =
      json.mode === "reinvitation"
        ? `Nouveau lien d'activation envoyé à ${email}.`
        : `Invitation envoyée à ${email}.`;
    setMessage(ok);
    toastSuccess(ok);
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      {etat === "ok" && <Alert variant="success">{message}</Alert>}
      {etat === "erreur" && <Alert variant="error">{message}</Alert>}
      {role === "choix_cabinet" && (
        <div>
          <Label>Accès</Label>
          <Select
            value={roleChoisi}
            onChange={(e) => setRoleChoisi(e.target.value as UserRole)}
          >
            {permettreDirecteur && (
              <option value="directeur">Directeur</option>
            )}
            <option value="admin_cabinet">Administrateur</option>
            <option value="collaborateur">Collaborateur</option>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Nom</Label>
          <Input required value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        <div>
          <Label>Prénom</Label>
          <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Adresse email</Label>
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={etat === "envoi"}>
        {etat === "envoi" ? "Envoi…" : libelleBouton}
      </Button>
    </form>
  );
}
