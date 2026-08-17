"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";
import { modifierDossier } from "@/app/cabinet/dossiers/actions";
import type { Dossier, Profile } from "@/lib/types";

/** Formulaire édition dossier avec toast de confirmation. */
export function DossierEditForm({
  dossier,
  collaborateurs,
}: {
  dossier: Dossier;
  collaborateurs: Profile[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [archive, setArchive] = useState(dossier.archive);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (archive) fd.set("archive", "on");
    else fd.delete("archive");

    startTransition(async () => {
      try {
        const result = await modifierDossier(dossier.id, fd);
        if (result?.error) {
          toastError(result.error);
          return;
        }
        toastSuccess("Dossier enregistré");
        router.refresh();
      } catch {
        toastError("Échec de l'enregistrement");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>Sigle</Label>
          <Input name="sigle" defaultValue={dossier.sigle} required />
        </div>
        <div>
          <Label>Raison sociale</Label>
          <Input
            name="raison_sociale"
            defaultValue={dossier.raison_sociale}
            required
          />
        </div>
        <div>
          <Label>Email</Label>
          <Input name="email" type="email" defaultValue={dossier.email ?? ""} />
        </div>
        <div>
          <Label>Téléphone</Label>
          <Input name="telephone" defaultValue={dossier.telephone ?? ""} />
        </div>
      </div>
      <div>
        <Label>Collaborateur en charge</Label>
        <Select
          name="collaborateur_id"
          defaultValue={dossier.collaborateur_id ?? ""}
        >
          <option value="">- Non affecté -</option>
          {collaborateurs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.prenom} {c.nom}
            </option>
          ))}
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={archive}
          onChange={(e) => setArchive(e.target.checked)}
        />
        Dossier archivé
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
