"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Label, Select } from "@/components/ui";
import {
  labelRole,
  peutEditerRoleMembre,
  roleEffectif,
  type RoleChoix,
} from "@/lib/roles-cabinet";
import { toastError, toastSuccess } from "@/lib/toast";
import type { UserRole } from "@/lib/types";

/** Formulaire de changement de rôle (sélection + Enregistrer). */
export function FormRoleMembre({
  profileId,
  role,
  roleMembre,
  cabinetId,
  acteurRole,
  acteurId,
}: {
  profileId: string;
  role: UserRole;
  roleMembre: string;
  cabinetId: string;
  acteurRole: UserRole;
  acteurId: string;
}) {
  const router = useRouter();
  const actuel = roleEffectif(role, roleMembre);
  const [valeur, setValeur] = useState<RoleChoix>(actuel);
  const [busy, setBusy] = useState(false);

  const peutEditer = peutEditerRoleMembre({
    acteurRole,
    acteurId,
    cibleId: profileId,
    roleCible: actuel,
  });

  if (!peutEditer) {
    return (
      <p className="text-sm text-gray-600">
        Rôle : <span className="font-medium text-gray-900">{labelRole(actuel)}</span>
        {profileId === acteurId && (
          <span className="text-gray-500"> (votre compte)</span>
        )}
      </p>
    );
  }

  const options: { value: RoleChoix; label: string }[] =
    acteurRole === "directeur"
      ? [
          { value: "directeur", label: "Directeur" },
          { value: "admin_cabinet", label: "Administrateur" },
          { value: "collaborateur", label: "Collaborateur" },
        ]
      : [
          { value: "collaborateur", label: "Collaborateur" },
          { value: "admin_cabinet", label: "Administrateur" },
        ];

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (valeur === actuel) {
      toastSuccess("Aucun changement");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/cabinet/membres/role", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile_id: profileId,
          role: valeur,
          cabinet_id: cabinetId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(json.error ?? "Changement impossible");
        return;
      }
      toastSuccess("Rôle mis à jour");
      router.push("/cabinet/equipe");
      router.refresh();
    } catch {
      toastError("Changement impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void enregistrer(e)} className="space-y-4 max-w-sm">
      <div>
        <Label>Rôle</Label>
        <Select
          value={valeur}
          disabled={busy}
          onChange={(e) => setValeur(e.target.value as RoleChoix)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || valeur === actuel}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => router.push("/cabinet/equipe")}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
