import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { chargerNotes } from "@/lib/notes";
import { formatDate, moisLabel } from "@/lib/format";
import { labelMotifSortie } from "@/lib/sortie";
import { SaisieSalarie } from "@/components/saisie-salarie";
import { NotesThread } from "@/components/notes-thread";
import { SortieSalarieForm } from "@/components/salarie-forms";
import { ArretMaladieClientForm } from "@/components/arret-maladie-form";
import { Alert, Card, CardBody, PageHeader } from "@/components/ui";
import type { Absence, Campagne, Salarie, SaisieVariables } from "@/lib/types";

export default async function SaisieSalariePage({
  params,
}: {
  params: Promise<{ id: string; salarieId: string }>;
}) {
  const profile = await requireRole(["client"]);
  const { id, salarieId } = await params;
  const supabase = await createClient();

  const [{ data: campagneData }, { data: salarieData }, { data: saisieExistante }] =
    await Promise.all([
      supabase
        .from("campagnes")
        .select("*")
        .eq("id", id)
        .eq("dossier_id", profile.dossier_id!)
        .maybeSingle(),
      supabase
        .from("salaries")
        .select("*")
        .eq("id", salarieId)
        .eq("dossier_id", profile.dossier_id!)
        .maybeSingle(),
      supabase
        .from("saisies_variables")
        .select("*")
        .eq("campagne_id", id)
        .eq("salarie_id", salarieId)
        .maybeSingle(),
    ]);
  if (!campagneData || !salarieData) notFound();
  const campagne = campagneData as Campagne;
  const salarie = salarieData as Salarie;
  const verrouillee = campagne.statut !== "ouverte";

  // Saisie : créée si absente (possible uniquement campagne ouverte)
  let saisie = saisieExistante;
  if (!saisie && !verrouillee) {
    const { data: nouvelle } = await supabase
      .from("saisies_variables")
      .insert({
        campagne_id: id,
        salarie_id: salarieId,
        dossier_id: profile.dossier_id!,
      })
      .select("*")
      .single();
    saisie = nouvelle;
  }
  if (!saisie) notFound();
  const s = saisie as SaisieVariables;

  const [{ data: absences }, notesSalarie] = await Promise.all([
    supabase.from("absences").select("*").eq("saisie_id", s.id),
    chargerNotes(supabase, {
      dossierId: profile.dossier_id!,
      campagneId: id,
      salarieId,
    }),
  ]);

  const heuresParJour = salarie.duree_hebdo ? Number(salarie.duree_hebdo) / 5 : 7;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        titre={`${salarie.nom} ${salarie.prenom}`}
        sousTitre={`Variables de ${moisLabel(campagne.mois)}${salarie.poste ? ` : ${salarie.poste}` : ""}`}
        actions={
          <Link
            href={`/client/variables/${id}`}
            className="text-sm text-blue-700 hover:underline"
          >
            ← Retour à la liste
          </Link>
        }
      />

      {salarie.date_sortie && (
        <Alert variant="warning">
          Sortie déclarée le {formatDate(salarie.date_sortie)}
          {salarie.motif_sortie
            ? ` : ${labelMotifSortie(salarie.motif_sortie)}`
            : ""}
          .
        </Alert>
      )}

      {verrouillee && (
        <Alert variant="info">
          Campagne verrouillée : la saisie est en lecture seule.
        </Alert>
      )}

      {!verrouillee && salarie.statut === "actif" && !salarie.date_sortie && (
        <Card>
          <CardBody>
            <details>
              <summary className="font-medium text-red-700 cursor-pointer text-sm">
                Déclarer une sortie pour ce salarié
              </summary>
              <div className="mt-3 max-w-md">
                <SortieSalarieForm
                  salarieId={salarie.id}
                  variant="client"
                  compact
                />
              </div>
            </details>
          </CardBody>
        </Card>
      )}

      {!verrouillee && salarie.statut === "actif" && (
        <Card>
          <CardBody>
            <details>
              <summary className="font-medium text-amber-800 cursor-pointer text-sm">
                Déclarer un arrêt maladie
              </summary>
              <div className="mt-3 max-w-md">
                <ArretMaladieClientForm
                  salarieId={salarie.id}
                  salarieNom={`${salarie.prenom} ${salarie.nom}`}
                  compact
                />
              </div>
            </details>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <SaisieSalarie
            saisie={s}
            absences={(absences ?? []) as Absence[]}
            mois={campagne.mois}
            heuresParJour={heuresParJour}
            campagneId={id}
            disabled={verrouillee}
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3">
            Notes sur ce salarié ({moisLabel(campagne.mois)})
          </h2>
          <NotesThread
            dossierId={profile.dossier_id!}
            campagneId={id}
            salarieId={salarieId}
            notes={notesSalarie}
            placeholder="Précision sur ce salarié : prime, acompte, absence particulière…"
          />
        </CardBody>
      </Card>
    </div>
  );
}
