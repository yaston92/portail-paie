import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { etatCampagne, saisieComplete, totauxAbsences } from "@/lib/campagne";
import { chargerNotes } from "@/lib/notes";
import { formatDate, formatDateTime, formatMontant, moisLabel } from "@/lib/format";
import {
  RelancerCampagne,
  RouvrirCampagne,
} from "@/components/campagne-cabinet-actions";
import { campagneTraitee, CampagneStatutBadge } from "@/components/campagne-badge";
import { TraiterCampagneButton } from "@/components/traiter-campagne-button";
import { BulletinsUploadForm } from "@/components/bulletins-upload-form";
import { NotesThread } from "@/components/notes-thread";
import {
  Badge,
  Card,
  CardBody,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { NATURE_LABELS, type Absence, type Campagne, type Dossier } from "@/lib/types";

export default async function CabinetCampagneDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin_cabinet", "collaborateur"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("campagnes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const campagne = data as Campagne;

  const [{ data: dossier }, etat] = await Promise.all([
    supabase
      .from("dossiers")
      .select("id, sigle, raison_sociale")
      .eq("id", campagne.dossier_id)
      .single(),
    etatCampagne(supabase, id, campagne.dossier_id, campagne.mois),
  ]);
  const d = dossier as Pick<Dossier, "id" | "sigle" | "raison_sociale">;

  const saisieIds = [...etat.saisiesParSalarie.values()].map((s) => s.id);
  const [notesMois, { data: absences }] = await Promise.all([
    chargerNotes(supabase, {
      dossierId: campagne.dossier_id,
      campagneId: id,
      salarieId: null,
    }),
    saisieIds.length
      ? supabase.from("absences").select("*").in("saisie_id", saisieIds)
      : Promise.resolve({ data: [] as Absence[] }),
  ]);
  const absencesParSaisie = new Map<string, Absence[]>();
  for (const a of (absences ?? []) as Absence[]) {
    const liste = absencesParSaisie.get(a.saisie_id) ?? [];
    liste.push(a);
    absencesParSaisie.set(a.saisie_id, liste);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titre={`${d.sigle} : ${moisLabel(campagne.mois)}`}
        sousTitre={`Date limite : ${formatDate(campagne.date_limite)}${
          campagne.envoyee_at ? ` : reçue le ${formatDateTime(campagne.envoyee_at)}` : ""
        }`}
        actions={
          <div className="flex items-center gap-3">
            <CampagneStatutBadge campagne={campagne} />
            {campagne.statut !== "ouverte" && !campagneTraitee(campagne) && (
              <TraiterCampagneButton campagneId={id} />
            )}
            {campagne.statut === "ouverte" && <RelancerCampagne campagneId={id} />}
            {campagne.statut !== "ouverte" && <RouvrirCampagne campagneId={id} />}
            {campagne.recap_chemin && (
              <a
                href={`/api/campagnes/${id}/recap`}
                className="text-sm text-blue-700 hover:underline"
              >
                Récap PDF
              </a>
            )}
          </div>
        }
      />

      {campagne.statut === "cloturee_identique" && (
        <Card>
          <CardBody>
            <p className="text-sm">
              Le client a confirmé que les paies de {moisLabel(campagne.mois)}{" "}
              sont <span className="font-semibold">identiques au mois précédent</span>
              {etat.attendus.some((s) => {
                const saisie = etat.saisiesParSalarie.get(s.id);
                if (!saisie) return false;
                return (absencesParSaisie.get(saisie.id) ?? []).some(
                  (a) => a.nature === "cp"
                );
              })
                ? " : les congés payés validés ci-dessous restent à prendre en compte."
                : "."}
            </p>
          </CardBody>
        </Card>
      )}

      {(campagne.statut !== "cloturee_identique" ||
        etat.attendus.some((s) => {
          const saisie = etat.saisiesParSalarie.get(s.id);
          if (!saisie) return false;
          return (absencesParSaisie.get(saisie.id) ?? []).some((a) => a.nature === "cp");
        })) && (
        <Card>
          <CardBody>
            <h2 className="font-semibold mb-3">
              {campagne.statut === "cloturee_identique"
                ? "Congés payés validés à intégrer"
                : `Saisies (${etat.completes}/${etat.attendus.length} complétées)`}
            </h2>
            <TableWrap>
              <thead className="bg-gray-50">
                <tr>
                  <Th>Salarié</Th>
                  <Th>Saisie</Th>
                  <Th>Détail</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {etat.attendus
                  .filter((s) => {
                    if (campagne.statut !== "cloturee_identique") return true;
                    const saisie = etat.saisiesParSalarie.get(s.id);
                    if (!saisie) return false;
                    return (absencesParSaisie.get(saisie.id) ?? []).some(
                      (a) => a.nature === "cp"
                    );
                  })
                  .map((s) => {
                  const saisie = etat.saisiesParSalarie.get(s.id);
                  const absencesSaisie = saisie
                    ? (absencesParSaisie.get(saisie.id) ?? [])
                    : [];
                  const totaux = totauxAbsences(
                    campagne.statut === "cloturee_identique"
                      ? absencesSaisie.filter((a) => a.nature === "cp")
                      : absencesSaisie
                  );
                  return (
                    <tr key={s.id}>
                      <Td className="font-medium">
                        <Link
                          href={`/cabinet/salaries/${s.id}`}
                          className="text-blue-700 hover:underline"
                        >
                          {s.nom} {s.prenom}
                        </Link>
                      </Td>
                      <Td>
                        {campagne.statut === "cloturee_identique" ? (
                          <Badge variant="blue">Congés payés</Badge>
                        ) : !saisieComplete(saisie) ? (
                          <Badge variant="amber">Non complété</Badge>
                        ) : saisie!.mode === "ras" ? (
                          <Badge variant="gray">Rien à signaler</Badge>
                        ) : saisie!.mode === "net" ? (
                          <Badge variant="blue">Net direct</Badge>
                        ) : (
                          <Badge variant="green">Variables</Badge>
                        )}
                      </Td>
                      <Td>
                        {campagne.statut !== "cloturee_identique" &&
                          saisie?.mode === "net" &&
                          formatMontant(saisie.net_montant)}
                        {(campagne.statut === "cloturee_identique" ||
                          saisie?.mode === "variables") && (
                          <span className="text-xs">
                            {campagne.statut !== "cloturee_identique" &&
                            saisie?.heures_supp
                              ? `HS : ${saisie.heures_supp} h. `
                              : ""}
                            {[...totaux.entries()]
                              .map(
                                ([n, t]) =>
                                  `${NATURE_LABELS[n as keyof typeof NATURE_LABELS]} : ${t.jours} j / ${t.heures} h`
                              )
                              .join(" · ")}
                          </span>
                        )}
                      </Td>
                      <Td className="text-xs text-gray-600 max-w-56 whitespace-pre-wrap">
                        {saisie?.note ?? ""}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          </CardBody>
        </Card>
      )}

      {(campagne.statut === "envoyee" ||
        campagne.statut === "cloturee_identique" ||
        campagne.statut === "bulletins_envoyes") && (
        <Card>
          <CardBody>
            <h2 className="font-semibold mb-1">
              {campagne.statut === "bulletins_envoyes"
                ? "Publié"
                : "Déposer les bulletins de paie"}
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              {campagne.statut === "bulletins_envoyes"
                ? `Les bulletins de ${moisLabel(campagne.mois)} sont publiés. Vous pouvez en déposer de nouveaux si besoin.`
                : `Variables reçues : déposez le PDF global du logiciel de paie pour ${d.sigle} (${moisLabel(campagne.mois)}).`}
            </p>
            {campagne.statut === "bulletins_envoyes" && (
              <p className="text-sm mb-3">
                <Link
                  href="/cabinet/bulletins"
                  className="text-blue-700 hover:underline"
                >
                  Voir les dépôts
                </Link>
              </p>
            )}
            <BulletinsUploadForm
              dossiers={[
                {
                  id: d.id,
                  sigle: d.sigle,
                  raison_sociale: d.raison_sociale,
                },
              ]}
              defaultDossierId={d.id}
              defaultMois={campagne.mois}
              hideDossierSelect
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3">Notes du mois</h2>
          <NotesThread
            dossierId={campagne.dossier_id}
            campagneId={id}
            notes={notesMois}
            placeholder="Réponse au client…"
          />
        </CardBody>
      </Card>
    </div>
  );
}
