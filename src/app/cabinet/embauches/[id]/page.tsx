import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMontant } from "@/lib/format";
import { EmbaucheActions } from "@/components/embauche-actions";
import { Alert, Badge, Card, CardBody, PageHeader } from "@/components/ui";
import type { Dossier, Embauche } from "@/lib/types";

export default async function CabinetEmbaucheDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin_cabinet", "collaborateur"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("embauches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const e = data as Embauche;

  const { data: dossier } = await supabase
    .from("dossiers")
    .select("*")
    .eq("id", e.dossier_id)
    .single();
  const d = dossier as Dossier;

  return (
    <div className="max-w-2xl space-y-4">
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
            <dd>{e.poste}</dd>
            <dt className="text-gray-500">Début de contrat</dt>
            <dd>{formatDate(e.date_debut)}</dd>
            <dt className="text-gray-500">Contrat</dt>
            <dd>{e.type_contrat.toUpperCase()}</dd>
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
            <dd>{e.duree_hebdo} h</dd>
            <dt className="text-gray-500">Salaire</dt>
            <dd>
              {e.salaire_minimum ? (
                <Badge variant="blue">Salaire minimum</Badge>
              ) : (
                formatMontant(e.salaire)
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

          <h3 className="font-semibold mt-5 mb-2 text-sm">Pièces (téléchargement journalisé)</h3>
          <ul className="text-sm space-y-1">
            {e.piece_identite_recto_chemin ? (
              <li>
                <a
                  href={`/api/embauches/${id}/piece/recto`}
                  className="text-blue-700 hover:underline"
                >
                  Pièce d&apos;identité : recto
                </a>
              </li>
            ) : (
              <li className="text-red-600">Pièce d&apos;identité : recto manquante</li>
            )}
            {e.piece_identite_verso_chemin ? (
              <li>
                <a
                  href={`/api/embauches/${id}/piece/verso`}
                  className="text-blue-700 hover:underline"
                >
                  Pièce d&apos;identité : verso
                </a>
              </li>
            ) : (
              <li className="text-red-600">Pièce d&apos;identité : verso manquante</li>
            )}
            {e.carte_vitale_chemin && (
              <li>
                <a
                  href={`/api/embauches/${id}/piece/carte_vitale`}
                  className="text-blue-700 hover:underline"
                >
                  Carte vitale
                </a>
              </li>
            )}
          </ul>
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
