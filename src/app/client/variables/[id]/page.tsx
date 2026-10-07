import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { etatCampagne, motifPaiesNonIdentiques, saisieComplete } from "@/lib/campagne";
import { chargerNotes } from "@/lib/notes";
import { formatDate, moisLabel } from "@/lib/format";
import {
  EnvoyerCampagne,
  QuestionIdentiques,
} from "@/components/campagne-client-actions";
import { NotesThread } from "@/components/notes-thread";
import { SortieSalarieForm } from "@/components/salarie-forms";
import { ArretMaladieClientForm } from "@/components/arret-maladie-form";
import { labelMotifSortie } from "@/lib/sortie";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  PageHeader,
} from "@/components/ui";
import type { Campagne } from "@/lib/types";

export default async function ClientCampagnePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole(["client"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("campagnes")
    .select("*")
    .eq("id", id)
    .eq("dossier_id", profile.dossier_id!)
    .maybeSingle();
  if (!data) notFound();
  const campagne = data as Campagne;

  // --- Cas 1 : question d'entrée pas encore répondue ---
  if (campagne.statut === "ouverte" && campagne.paies_identiques === null) {
    const motifBlocage = await motifPaiesNonIdentiques(
      supabase,
      profile.dossier_id!,
      campagne.mois
    );
    return (
      <div className="max-w-2xl mx-auto">
        <PageHeader
          titre={`Variables de paie : ${moisLabel(campagne.mois)}`}
          sousTitre={`Date limite : ${formatDate(campagne.date_limite)}`}
        />
        <QuestionIdentiques campagneId={id} motifBlocage={motifBlocage} />
      </div>
    );
  }

  // --- Cas 2 : clôturée « paies identiques » ---
  if (campagne.statut === "cloturee_identique") {
    return (
      <div className="max-w-2xl mx-auto">
        <PageHeader titre={`Variables de paie : ${moisLabel(campagne.mois)}`} />
        <Alert variant="success">
          Vous avez indiqué que les paies de {moisLabel(campagne.mois)} sont
          identiques au mois précédent. La campagne est terminée. Les congés
          payés déjà validés pour ce mois ont bien été transmis au cabinet.
        </Alert>
      </div>
    );
  }

  // --- Cas 3 : saisie salarié par salarié (ouverte ou envoyée) ---
  const verrouillee =
    campagne.statut === "envoyee" || campagne.statut === "bulletins_envoyes";

  // La fiche salarié crée la saisie à l'ouverture : pas d'écriture à chaque affichage.
  const [etat, notesMois] = await Promise.all([
    etatCampagne(supabase, id, profile.dossier_id!, campagne.mois),
    chargerNotes(supabase, {
      dossierId: profile.dossier_id!,
      campagneId: id,
      salarieId: null,
    }),
  ]);

  const pct =
    etat.attendus.length > 0
      ? Math.round((etat.completes / etat.attendus.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        titre={`Variables de paie : ${moisLabel(campagne.mois)}`}
        sousTitre={
          verrouillee
            ? "Saisie envoyée et verrouillée."
            : `Date limite : ${formatDate(campagne.date_limite)} : complétez chaque salarié puis envoyez.`
        }
        actions={
          campagne.recap_chemin && (
            <a
              href={`/api/campagnes/${id}/recap`}
              className="text-sm text-blue-700 hover:underline"
            >
              Récapitulatif PDF
            </a>
          )
        }
      />

      {verrouillee && (
        <Alert variant="success">
          Variables envoyées au cabinet le{" "}
          {formatDate(campagne.envoyee_at?.slice(0, 10))}. La saisie est
          verrouillée.
        </Alert>
      )}

      {/* Compteur d'avancement */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-sm">
              {etat.completes} salarié{etat.completes > 1 ? "s" : ""} sur{" "}
              {etat.attendus.length} complété{etat.completes > 1 ? "s" : ""}
            </p>
            <span className="text-sm text-gray-500">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </CardBody>
      </Card>

      {/* Salariés incomplets : chaque ligne renvoie sur le salarié à compléter */}
      {!verrouillee && etat.incomplets.length > 0 && (
        <Alert variant="warning">
          <p className="font-semibold mb-1">
            {etat.incomplets.length} salarié(s) restant à compléter :
          </p>
          <ul className="list-disc ml-5 space-y-0.5">
            {etat.incomplets.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/client/variables/${id}/salarie/${s.id}`}
                  className="underline"
                >
                  {s.nom} {s.prenom}
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3">Salariés du mois</h2>
          <ul className="divide-y divide-gray-100">
            {etat.attendus.map((s) => {
              const saisie = etat.saisiesParSalarie.get(s.id);
              const complete = saisieComplete(saisie);
              const peutSortir = s.statut === "actif" && !s.date_sortie && !verrouillee;
              return (
                <li key={s.id} className="py-2">
                  <div className="flex items-center justify-between gap-3 px-2 rounded-lg hover:bg-gray-50">
                    <Link
                      href={`/client/variables/${id}/salarie/${s.id}`}
                      className="flex-1 flex items-center justify-between py-2 min-w-0"
                    >
                      <span className="font-medium text-sm">
                        {s.nom} {s.prenom}
                        {s.date_sortie && (
                          <span className="ml-2 text-xs text-amber-700">
                            (sortie le {formatDate(s.date_sortie)}
                            {s.motif_sortie
                              ? ` : ${labelMotifSortie(s.motif_sortie)}`
                              : ""}
                            )
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        {complete ? (
                          saisie!.mode === "ras" ? (
                            <Badge variant="gray">Rien à signaler</Badge>
                          ) : saisie!.mode === "net" ? (
                            <Badge variant="green">Net saisi</Badge>
                          ) : (
                            <Badge variant="green">Variables saisies</Badge>
                          )
                        ) : (
                          <Badge variant="amber">À compléter</Badge>
                        )}
                        <span className="text-blue-700 text-sm">
                          {verrouillee ? "Voir" : "Compléter"} →
                        </span>
                      </span>
                    </Link>
                  </div>
                  {peutSortir && (
                    <details className="px-2 pb-2">
                      <summary className="text-xs text-red-700 cursor-pointer">
                        Déclarer une sortie
                      </summary>
                      <div className="mt-2 max-w-md">
                        <SortieSalarieForm
                          salarieId={s.id}
                          variant="client"
                          compact
                        />
                      </div>
                    </details>
                  )}
                  {!verrouillee && s.statut === "actif" && (
                    <details className="px-2 pb-2">
                      <summary className="text-xs text-amber-800 cursor-pointer">
                        Déclarer un arrêt maladie
                      </summary>
                      <div className="mt-2 max-w-md">
                        <ArretMaladieClientForm
                          salarieId={s.id}
                          salarieNom={`${s.prenom} ${s.nom}`}
                          compact
                        />
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3">Notes du mois</h2>
          <p className="text-xs text-gray-500 mb-3">
            Ajoutez ici ce qui ne rentre pas dans les cases (primes, acomptes,
            situations particulières) avant de valider. Vous pouvez joindre des
            pièces. Le cabinet peut vous répondre.
          </p>
          <NotesThread
            dossierId={profile.dossier_id!}
            campagneId={id}
            notes={notesMois}
          />
        </CardBody>
      </Card>

      {!verrouillee && (
        <Card>
          <CardBody>
            <EnvoyerCampagne
              campagneId={id}
              incompletsInitiaux={etat.incomplets.map((s) => ({
                id: s.id,
                nom: `${s.nom} ${s.prenom}`,
              }))}
              completes={etat.completes}
              total={etat.attendus.length}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
