import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmbaucheForm } from "@/components/embauche-form";
import { Card, CardBody, PageHeader } from "@/components/ui";

export default async function NouvelleEmbauchePage() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();
  const { data: dossier } = await supabase
    .from("dossiers")
    .select("convention_collective")
    .eq("id", profile.dossier_id!)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <PageHeader
        titre="Déclarer une embauche"
        sousTitre="Tous les champs marqués * et les pièces sont obligatoires : l'envoi est bloqué tant qu'un élément manque."
      />
      <Card>
        <CardBody>
          <EmbaucheForm
            conventionCollective={
              (dossier as { convention_collective?: string | null } | null)
                ?.convention_collective
            }
          />
        </CardBody>
      </Card>
    </div>
  );
}
