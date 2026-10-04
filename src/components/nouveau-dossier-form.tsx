"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";
import { creerDossier } from "@/app/cabinet/dossiers/actions";
import type { Profile } from "@/lib/types";

/** Formulaire de création : toast de confirmation et champs vidés. */
export function NouveauDossierForm({
  collaborateurs,
}: {
  collaborateurs: Profile[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await creerDossier(fd);
        if (result && "error" in result && result.error) {
          toastError(result.error);
          return;
        }
        if (result && "ok" in result && result.ok) {
          toastSuccess(`Dossier ${result.sigle} créé`, 6000);
          formRef.current?.reset();
          router.push(`/cabinet/dossiers/${result.id}?cree=1`);
        }
      } catch {
        toastError("Échec de la création du dossier");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>Sigle *</Label>
          <Input name="sigle" required placeholder="ex : OPT" maxLength={10} />
        </div>
        <div>
          <Label>Raison sociale *</Label>
          <Input name="raison_sociale" required />
        </div>
        <div>
          <Label>Email de contact</Label>
          <Input name="email" type="email" />
        </div>
        <div>
          <Label>Téléphone</Label>
          <Input name="telephone" />
        </div>
        <div>
          <Label>SIRET</Label>
          <Input name="siret" inputMode="numeric" placeholder="14 chiffres" maxLength={17} />
        </div>
        <div>
          <Label>Convention collective</Label>
          <Input
            name="convention_collective"
            placeholder="ex. IDCC 1979 ou nom de la convention"
          />
        </div>
      </div>
      <div>
        <Label>Collaborateur en charge</Label>
        <Select name="collaborateur_id" defaultValue="">
          <option value="">- Non affecté -</option>
          {collaborateurs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.prenom} {c.nom}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Création…" : "Créer le dossier"}
      </Button>
    </form>
  );
}
