import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { ArretsMaladieListe } from "@/components/arrets-maladie-liste";
import type { ArretMaladie } from "@/lib/types";

/** Arrêts maladie du dossier client (déclarés par salariés ou employeur). */
export default async function ClientArretsMaladiePage() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("arrets_maladie")
    .select("*, salaries(nom, prenom)")
    .eq("dossier_id", profile.dossier_id!)
    .order("created_at", { ascending: false })
    .limit(100);

  const arrets = (data ?? []) as (ArretMaladie & {
    salaries?: { nom: string; prenom: string } | null;
  })[];

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Arrêts maladie"
        sousTitre="Arrêts déclarés par vos salariés ou par vous : téléchargez les justificatifs"
      />
      <Card>
        <CardBody>
          <ArretsMaladieListe arrets={arrets} />
        </CardBody>
      </Card>
    </div>
  );
}
