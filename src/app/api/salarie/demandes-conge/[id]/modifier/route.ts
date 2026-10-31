import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import { aujourdhuiParis, joursOuvres, retirerAbsencesCp } from "@/lib/demandes-conge";
import { formatDate } from "@/lib/format";
import { destinatairesClient, notifier } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DemandeConge } from "@/lib/types";

const schema = z.object({
  date_debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commentaire: z.string().max(2000).optional(),
});

/** Toute modification repasse la demande en attente : l'employeur doit à nouveau accepter. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["salarie"]);
  if (!profile?.salarie_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { date_debut, date_fin } = body.data;
  const today = aujourdhuiParis();
  if (date_debut < today) {
    return NextResponse.json(
      { error: "Impossible de demander des congés dans le passé." },
      { status: 400 }
    );
  }
  if (date_fin < date_debut) {
    return NextResponse.json(
      { error: "La date de fin doit être après la date de début." },
      { status: 400 }
    );
  }
  const joursListe = joursOuvres(date_debut, date_fin);
  if (joursListe.length === 0) {
    return NextResponse.json({ error: "Aucun jour ouvré dans la période." }, { status: 400 });
  }

  const { id } = await context.params;
  const admin = createAdminClient();
  const { data: demande } = await admin.from("demandes_conge").select("*").eq("id", id).maybeSingle();
  const d = demande as DemandeConge | null;
  if (!d || d.salarie_id !== profile.salarie_id) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }
  if (d.statut === "annulee") {
    return NextResponse.json({ error: "Cette demande est annulée." }, { status: 400 });
  }

  if (d.statut === "validee") {
    await retirerAbsencesCp({
      salarieId: d.salarie_id,
      jours: joursOuvres(d.date_debut, d.date_fin),
    });
  }

  const { data: updated, error } = await admin
    .from("demandes_conge")
    .update({
      date_debut,
      date_fin,
      jours: joursListe.length,
      commentaire: body.data.commentaire?.trim() || d.commentaire,
      statut: "en_attente",
      pending_sync: [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nom = `${profile.prenom} ${profile.nom}`.trim() || profile.email;
  await notifier({
    userIds: await destinatairesClient(d.dossier_id),
    titre: "Congés modifiés, accord à redonner",
    corps: `${nom} a modifié sa demande : du ${formatDate(date_debut)} au ${formatDate(date_fin)}. Votre accord est à nouveau nécessaire.`,
    lien: "/client/conges",
  });

  await journaliser({
    userId: profile.id,
    action: "modification_demande_conge",
    cibleType: "demande_conge",
    cibleId: id,
    dossierId: d.dossier_id,
    details: { date_debut, date_fin },
  });

  return NextResponse.json(updated as DemandeConge);
}
