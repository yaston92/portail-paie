import { createClient } from "@/lib/supabase/server";
import {
  peutAdminCabinet,
  requireCabinetContext,
} from "@/lib/cabinet";
import { NouveauDossierForm } from "@/components/nouveau-dossier-form";
import { Card, CardBody, PageHeader } from "@/components/ui";
import type { Profile } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function NouveauDossierPage() {
  const { profile, cabinet } = await requireCabinetContext();
  if (!cabinet || !peutAdminCabinet(profile, cabinet)) redirect("/cabinet/dossiers");

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
          <NouveauDossierForm collaborateurs={collaborateurs} />
        </CardBody>
      </Card>
    </div>
  );
}
