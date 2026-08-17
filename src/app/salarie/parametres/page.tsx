import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OppositionToggle } from "@/components/opposition-toggle";
import { SupprimerCompte } from "@/components/supprimer-compte";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui";
import type { Salarie } from "@/lib/types";

export default async function SalarieParametresPage() {
  const profile = await requireRole(["salarie"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("salaries")
    .select("*")
    .eq("id", profile.salarie_id!)
    .maybeSingle();
  const salarie = data as Salarie | null;

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader titre="Paramètres" />

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-2">Bulletin de paie dématérialisé</h2>
          <p className="text-sm text-gray-600 mb-3">
            Par défaut, vos bulletins de paie vous sont remis sous forme
            électronique dans cet espace. Conformément au Code du travail, vous
            pouvez vous y opposer à tout moment : vos bulletins vous seront
            alors remis sous forme papier par votre employeur. Les bulletins
            déjà publiés restent consultables.
          </p>
          <p className="text-sm mb-4">
            Statut actuel :{" "}
            {salarie?.opposition_bulletin ? (
              <Badge variant="red">Opposition exercée : remise papier</Badge>
            ) : (
              <Badge variant="green">Bulletin dématérialisé actif</Badge>
            )}
          </p>
          <OppositionToggle opposition={salarie?.opposition_bulletin ?? false} />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-2">Vos données personnelles</h2>
          <p className="text-sm text-gray-600">
            Vos données sont hébergées dans l&apos;Union européenne et
            conservées selon les durées légales. Vous pouvez supprimer votre
            compte ci-dessous. Pour les autres demandes (accès, rectification),
            contactez votre employeur ou le cabinet.
          </p>
        </CardBody>
      </Card>

      <SupprimerCompte />
    </div>
  );
}
