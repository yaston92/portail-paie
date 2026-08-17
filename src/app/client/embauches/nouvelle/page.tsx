import { requireRole } from "@/lib/auth";
import { EmbaucheForm } from "@/components/embauche-form";
import { Card, CardBody, PageHeader } from "@/components/ui";

export default async function NouvelleEmbauchePage() {
  await requireRole(["client"]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        titre="Déclarer une embauche"
        sousTitre="Tous les champs marqués * et les pièces sont obligatoires : l'envoi est bloqué tant qu'un élément manque."
      />
      <Card>
        <CardBody>
          <EmbaucheForm />
        </CardBody>
      </Card>
    </div>
  );
}
