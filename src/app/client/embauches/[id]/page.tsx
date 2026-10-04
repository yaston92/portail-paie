import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { texteDureeHebdo, texteSalaire } from "@/lib/embauche-affichage";
import { EmbaucheForm } from "@/components/embauche-form";
import { Alert, Badge, Card, CardBody, PageHeader } from "@/components/ui";
import type { Embauche } from "@/lib/types";

export default async function ClientEmbaucheDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole(["client"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("embauches")
    .select("*")
    .eq("id", id)
    .eq("dossier_id", profile.dossier_id!)
    .maybeSingle();
  if (!data) notFound();
  const e = data as Embauche;

  if (e.statut === "retourne") {
    return (
      <div className="max-w-2xl">
        <PageHeader
          titre={`Compléter l'embauche : ${e.nom} ${e.prenom}`}
          sousTitre="Le cabinet vous a retourné cette déclaration pour complément."
        />
        <Card>
          <CardBody>
            <EmbaucheForm embauche={e} />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader titre={`Embauche : ${e.nom} ${e.prenom}`} />
      {e.accompagnement && (
        <Alert variant="info">
          Vous avez demandé à être rappelé. Le cabinet vous contactera pour
          compléter ce qui manque.
        </Alert>
      )}
      {e.statut === "envoye" && (
        <Alert variant="info">
          Déclaration envoyée le {formatDate(e.created_at.slice(0, 10))}, en
          attente de validation par le cabinet.
        </Alert>
      )}
      {e.statut === "valide" && (
        <Alert variant="success">
          Embauche validée : la fiche salarié a été créée dans votre liste.
        </Alert>
      )}
      <Card>
        <CardBody>
          <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-gray-500">Poste</dt>
            <dd>{e.poste || "-"}</dd>
            <dt className="text-gray-500">Début de contrat</dt>
            <dd>{formatDate(e.date_debut)}</dd>
            <dt className="text-gray-500">Contrat</dt>
            <dd>{e.type_contrat ? e.type_contrat.toUpperCase() : "-"}</dd>
            {e.type_contrat === "cdd" && e.cdd_duree && (
              <>
                <dt className="text-gray-500">Date de fin</dt>
                <dd>
                  {/^\d{4}-\d{2}-\d{2}$/.test(e.cdd_duree)
                    ? formatDate(e.cdd_duree)
                    : e.cdd_duree}
                </dd>
              </>
            )}
            <dt className="text-gray-500">Durée hebdomadaire</dt>
            <dd>{texteDureeHebdo(e.duree_hebdo)}</dd>
            <dt className="text-gray-500">Salaire</dt>
            <dd>
              {e.salaire_minimum ? (
                <Badge variant="blue">Salaire minimum</Badge>
              ) : (
                texteSalaire(e)
              )}
            </dd>
            {e.note && (
              <>
                <dt className="text-gray-500">Note</dt>
                <dd className="whitespace-pre-wrap">{e.note}</dd>
              </>
            )}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
