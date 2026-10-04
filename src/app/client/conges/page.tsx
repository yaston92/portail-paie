import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { DemandesCongeListe } from "@/components/demandes-conge-liste";
import type { DemandeConge } from "@/lib/types";

export default async function ClientCongesPage() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("demandes_conge")
    .select("*, salaries(nom, prenom)")
    .eq("dossier_id", profile.dossier_id!)
    .order("created_at", { ascending: false })
    .limit(200);

  const demandes = (data ?? []) as (DemandeConge & {
    salaries?: { nom: string; prenom: string } | null;
  })[];

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Demandes de congés"
        sousTitre="Validez ou refusez les demandes de vos salariés"
      />
      <Card>
        <CardBody>
          <DemandesCongeListe initiales={demandes} />
        </CardBody>
      </Card>
    </div>
  );
}
