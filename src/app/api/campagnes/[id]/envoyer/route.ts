import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";
import { destinatairesCabinet, notifier } from "@/lib/notify";
import { etatCampagne } from "@/lib/campagne";
import { genererRecapPdf } from "@/lib/recap-pdf";
import { uploaderFichier } from "@/lib/storage";
import { moisLabel } from "@/lib/format";
import type { Absence, Campagne } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Envoi définitif des variables par le client.
 * BLOCAGE IMPÉRATIF : refuse tant qu'un salarié attendu n'est pas complété.
 * Ensuite : verrouillage, récap PDF, notification du collaborateur.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await getApiProfile(["client"]);
    if (!profile?.dossier_id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
    const { id } = await params;

    const admin = createAdminClient();
    const { data } = await admin
      .from("campagnes")
      .select("*")
      .eq("id", id)
      .eq("dossier_id", profile.dossier_id)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }
    const campagne = data as Campagne;
    if (campagne.statut !== "ouverte") {
      return NextResponse.json({ error: "Campagne déjà envoyée." }, { status: 400 });
    }
    if (campagne.paies_identiques !== false) {
      return NextResponse.json(
        { error: "Répondez d'abord à la question sur les paies identiques." },
        { status: 400 }
      );
    }

    // --- Blocage : tous les salariés du mois doivent être complétés ---
    const etat = await etatCampagne(admin, id, campagne.dossier_id, campagne.mois);
    if (etat.incomplets.length > 0) {
      return NextResponse.json(
        {
          error: "Envoi bloqué : des salariés ne sont pas complétés.",
          incomplets: etat.incomplets.map((s) => ({
            id: s.id,
            nom: `${s.nom} ${s.prenom}`,
          })),
          completes: etat.completes,
          total: etat.attendus.length,
        },
        { status: 400 }
      );
    }

    // --- Récap PDF ---
    const saisieIds = [...etat.saisiesParSalarie.values()].map((s) => s.id);
    const { data: absences } = saisieIds.length
      ? await admin.from("absences").select("*").in("saisie_id", saisieIds)
      : { data: [] };
    const absencesParSaisie = new Map<string, Absence[]>();
    for (const a of (absences ?? []) as Absence[]) {
      const liste = absencesParSaisie.get(a.saisie_id) ?? [];
      liste.push(a);
      absencesParSaisie.set(a.saisie_id, liste);
    }

    const { data: noteMois } = await admin
      .from("notes")
      .select("contenu")
      .eq("campagne_id", id)
      .is("salarie_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

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
      paiesIdentiques: false,
      attendus: etat.attendus,
      saisies: etat.saisiesParSalarie,
      absencesParSaisie,
      noteMois: noteMois?.contenu ?? null,
    });

    const recapChemin = `campagnes/${campagne.dossier_id}/${campagne.mois}/recap-${id}.pdf`;
    await uploaderFichier("documents", recapChemin, pdf, "application/pdf");

    // --- Verrouillage ---
    await admin
      .from("campagnes")
      .update({ statut: "envoyee", envoyee_at: dateEnvoi, recap_chemin: recapChemin })
      .eq("id", id);

    await journaliser({
      userId: profile.id,
      action: "campagne_envoyee",
      cibleType: "campagne",
      cibleId: id,
      dossierId: campagne.dossier_id,
      details: { salaries: etat.attendus.length },
    });

    await notifier({
      userIds: await destinatairesCabinet(campagne.dossier_id),
      titre: `${dossier?.sigle ?? ""} : variables reçues (${moisLabel(campagne.mois)})`,
      corps: `Le client a envoyé ses variables de paie : ${etat.attendus.length} salarié(s). Export Excel disponible.`,
      lien: `/cabinet/campagnes/${id}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("campagne/envoyer", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Échec de l'envoi : ${e.message}`
            : "Échec de l'envoi des variables.",
      },
      { status: 500 }
    );
  }
}
