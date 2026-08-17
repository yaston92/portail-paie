import { createClient } from "@/lib/supabase/server";
import {
  peutAdminCabinet,
  requireCabinetContext,
} from "@/lib/cabinet";
import { creerDossier } from "../actions";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";
import type { Profile } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function NouveauDossierPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { profile, cabinet } = await requireCabinetContext();
  if (!cabinet || !peutAdminCabinet(profile, cabinet)) redirect("/cabinet/dossiers");
  const { erreur } = await searchParams;

  const supabase = await createClient();
  const { data: membres } = await supabase
    .from("cabinet_membres")
    .select("profile:profiles (id, nom, prenom, role)")
    .eq("cabinet_id", cabinet.id);

  const collaborateurs: Profile[] = [];
  for (const row of membres ?? []) {
    const p = (row as unknown as { profile?: Profile | null }).profile;
    if (p) collaborateurs.push(p);
  }
  collaborateurs.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return (
    <div className="max-w-xl">
      <PageHeader titre="Nouveau dossier client" />
      <Card>
        <CardBody>
          <form action={creerDossier} className="space-y-4">
            {erreur && <Alert variant="error">{erreur}</Alert>}
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
            <Button type="submit">Créer le dossier</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
