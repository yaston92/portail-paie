import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { texteDureeHebdo, texteSalaire } from "@/lib/embauche-affichage";
import { EmbaucheActions } from "@/components/embauche-actions";
import { LeverRappelEmbauche } from "@/components/lever-rappel-embauche";
import { PiecesEmbauche } from "@/components/pieces-embauche";
import { Alert, Badge, Card, CardBody, PageHeader } from "@/components/ui";
import type { Dossier, Embauche } from "@/lib/types";

export default async function CabinetEmbaucheDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["directeur", "admin_cabinet", "collaborateur"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("embauches")
    .select("*, dossiers(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const row = data as Embauche & { dossiers: Dossier | Dossier[] | null };
  const dossierJoint = Array.isArray(row.dossiers) ? row.dossiers[0] : row.dossiers;
  if (!dossierJoint) notFound();
  const { dossiers: _dossier, ...embauche } = row;
  const e = embauche as Embauche;
  const d = dossierJoint;

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        titre={`Embauche : ${e.nom} ${e.prenom}`}
        sousTitre={`Dossier ${d.sigle} : ${d.raison_sociale}`}
        actions={
          <Link
            href="/cabinet/embauches"
            className="text-sm text-blue-700 hover:underline"
          >
            Toutes les embauches
          </Link>
        }
      />

      {e.accompagnement && !e.rappel_traite_at && (
        <Alert variant="warning">
          <p>
            Le client ne connaissait pas toutes les informations et souhaite être
            rappelé pour un accompagnement. Les champs vides sont ceux qu&apos;il n&apos;a
            pas pu remplir.
          </p>
          <div className="mt-3">
            <LeverRappelEmbauche embaucheId={id} />
          </div>
        </Alert>
      )}
      {e.statut === "retourne" && (
        <Alert variant="warning">
          Retournée au client pour complément : {e.commentaire_retour}
        </Alert>
      )}
      {e.statut === "valide" && (
        <Alert variant="success">
          Embauche validée : fiche salarié créée.{" "}
          {e.salarie_id && (
            <Link
              href={`/cabinet/salaries/${e.salarie_id}`}
              className="underline"
            >
              Voir la fiche
            </Link>
          )}
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
            <dt className="text-gray-500">N° sécurité sociale</dt>
            <dd>{e.nir ? "Renseigné (visible après validation)" : "Non renseigné"}</dd>
            {e.note && (
              <>
                <dt className="text-gray-500">Note du client</dt>
                <dd className="whitespace-pre-wrap">{e.note}</dd>
              </>
            )}
          </dl>

          <h3 className="font-semibold mt-5 mb-3 text-sm">Pièces</h3>
          <PiecesEmbauche
            id={id}
            pieces={[
              {
                type: "recto",
                chemin: e.piece_identite_recto_chemin,
                label: "Pièce d'identité : recto",
              },
              {
                type: "verso",
                chemin: e.piece_identite_verso_chemin,
                label: "Pièce d'identité : verso",
              },
              {
                type: "carte_vitale",
                chemin: e.carte_vitale_chemin,
                label: "Carte vitale",
              },
            ]}
          />
        </CardBody>
      </Card>

      {e.statut === "envoye" && (
        <Card>
          <CardBody>
            <h2 className="font-semibold mb-3">Décision</h2>
            <EmbaucheActions embaucheId={id} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
