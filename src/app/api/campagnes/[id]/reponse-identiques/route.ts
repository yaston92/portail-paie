import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";
import { etatCampagne } from "@/lib/campagne";
import { rejouerPendingSyncCampagne } from "@/lib/demandes-conge";
import { rejouerPendingSyncArretsMaladie } from "@/lib/arrets-maladie";
import { destinatairesCabinet, notifier } from "@/lib/notify";
import { moisLabel } from "@/lib/format";
import { genererRecapPdf } from "@/lib/recap-pdf";
import { uploaderFichier } from "@/lib/storage";
import type { Absence, SaisieVariables } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({ identiques: z.boolean() });

/**
 * Réponse du client à la question « vos paies sont-elles les mêmes que
 * d'habitude ? ». OUI : la campagne est clôturée immédiatement.
 * Les congés payés déjà validés restent pris en compte (absences + récap).
 * NON : la saisie salarié par salarié s'ouvre.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["client"]);
  if (!profile?.dossier_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id } = await params;

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: campagne } = await admin
    .from("campagnes")
    .select("id, dossier_id, mois, statut")
    .eq("id", id)
    .eq("dossier_id", profile.dossier_id)
    .maybeSingle();
  if (!campagne) {
    return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  }
  if (campagne.statut !== "ouverte") {
    return NextResponse.json({ error: "Campagne déjà clôturée." }, { status: 400 });
  }

  if (body.data.identiques) {
    // Injecte les CP validés (pending ou déjà liés au mois) avant clôture
    await rejouerPendingSyncCampagne({
      dossierId: campagne.dossier_id,
      mois: campagne.mois,
    });
    await rejouerPendingSyncArretsMaladie({
      dossierId: campagne.dossier_id,
      mois: campagne.mois,
    });

    const etat = await etatCampagne(
      admin,
      id,
      campagne.dossier_id,
      campagne.mois
    );
    const saisieIds = [...etat.saisiesParSalarie.values()].map((s) => s.id);
    const { data: absencesData } = saisieIds.length
      ? await admin.from("absences").select("*").in("saisie_id", saisieIds)
      : { data: [] as Absence[] };

    const absencesParSaisie = new Map<string, Absence[]>();
    for (const a of (absencesData ?? []) as Absence[]) {
      const liste = absencesParSaisie.get(a.saisie_id) ?? [];
      liste.push(a);
      absencesParSaisie.set(a.saisie_id, liste);
    }

    // Saisies avec CP → mode variables pour l’export / le récap
    const saisiesAvecCp: SaisieVariables[] = [];
    for (const saisie of etat.saisiesParSalarie.values()) {
      const abs = absencesParSaisie.get(saisie.id) ?? [];
      if (abs.some((a) => a.nature === "cp")) {
        saisiesAvecCp.push(saisie);
        if (saisie.mode !== "variables" && saisie.mode !== "net") {
          await admin
            .from("saisies_variables")
            .update({
              mode: "variables",
              updated_at: new Date().toISOString(),
            })
            .eq("id", saisie.id);
          saisie.mode = "variables";
        }
      }
    }

    const nbJoursCp = [...absencesParSaisie.values()]
      .flat()
      .filter((a) => a.nature === "cp").length;

    const { data: dossier } = await admin
      .from("dossiers")
      .select("sigle, raison_sociale")
      .eq("id", campagne.dossier_id)
      .single();

    const dateEnvoi = new Date().toISOString();
    const pdf = await genererRecapPdf({
      sigle: dossier?.sigle ?? "",
      raisonSociale: dossier?.raison_sociale ?? "",
      mois: campagne.mois,
      dateEnvoi,
      paiesIdentiques: true,
      attendus: etat.attendus,
      saisies: etat.saisiesParSalarie,
      absencesParSaisie,
      noteMois: null,
    });

    const recapChemin = `campagnes/${campagne.dossier_id}/${campagne.mois}/recap-${id}.pdf`;
    await uploaderFichier("documents", recapChemin, pdf, "application/pdf");

    await admin
      .from("campagnes")
      .update({
        paies_identiques: true,
        statut: "cloturee_identique",
        envoyee_at: dateEnvoi,
        recap_chemin: recapChemin,
      })
      .eq("id", id);

    const corps =
      nbJoursCp > 0
        ? `Paies identiques au mois précédent, avec ${nbJoursCp} jour(s) de congés payés validés à prendre en compte (${saisiesAvecCp.length} salarié(s)).`
        : "Le client a confirmé que les paies sont identiques au mois précédent.";

    await notifier({
      userIds: await destinatairesCabinet(campagne.dossier_id),
      titre: `${dossier?.sigle ?? ""} : paies identiques (${moisLabel(campagne.mois)})`,
      corps,
      lien: `/cabinet/campagnes/${id}`,
    });
  } else {
    await admin.from("campagnes").update({ paies_identiques: false }).eq("id", id);
  }

  await journaliser({
    userId: profile.id,
    action: "campagne_reponse_identiques",
    cibleType: "campagne",
    cibleId: id,
    dossierId: campagne.dossier_id,
    details: { identiques: body.data.identiques },
  });

  return NextResponse.json({ ok: true });
}
