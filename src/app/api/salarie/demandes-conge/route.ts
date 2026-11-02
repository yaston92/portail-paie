import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import { aujourdhuiParis, joursOuvres } from "@/lib/demandes-conge";
import { formatDate } from "@/lib/format";
import { prevenirDemandeConge } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DemandeConge } from "@/lib/types";

export async function GET() {
  const profile = await getApiProfile(["salarie"]);
  if (!profile?.salarie_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("demandes_conge")
    .select("*")
    .eq("salarie_id", profile.salarie_id)
    .order("created_at", { ascending: false });
  return NextResponse.json((data ?? []) as DemandeConge[]);
}

const schema = z.object({
  date_debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commentaire: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const profile = await getApiProfile(["salarie"]);
  if (!profile?.salarie_id || !profile.dossier_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { date_debut, date_fin, commentaire } = body.data;
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
    return NextResponse.json(
      { error: "Aucun jour ouvré dans la période." },
      { status: 400 }
    );
  }
  const jours = joursListe.length;

  const admin = createAdminClient();
  const { data: solde } = await admin
    .from("soldes_cp")
    .select("restant")
    .eq("salarie_id", profile.salarie_id)
    .maybeSingle();

  const restantBulletin = solde?.restant == null ? null : Number(solde.restant);
  if (restantBulletin != null && jours > restantBulletin + 0.001) {
    return NextResponse.json(
      {
        error: `Le bulletin indique ${restantBulletin.toLocaleString("fr-FR")} jour(s) restant(s). Cette demande en compte ${jours}.`,
      },
      { status: 400 }
    );
  }

  const { data: created, error } = await admin
    .from("demandes_conge")
    .insert({
      salarie_id: profile.salarie_id,
      dossier_id: profile.dossier_id,
      demandeur_id: profile.id,
      date_debut,
      date_fin,
      jours,
      commentaire: commentaire?.trim() || null,
      statut: "en_attente",
    })
    .select("*")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: error?.message || "Création impossible" },
      { status: 500 }
    );
  }

  const nom = `${profile.prenom} ${profile.nom}`.trim() || profile.email;
  await prevenirDemandeConge({
    dossierId: profile.dossier_id,
    titre: "Demande de congés payés",
    corps: `${nom} demande ${jours} jour(s) de congés, du ${formatDate(date_debut)} au ${formatDate(date_fin)}. Merci de donner votre accord.`,
  });

  await journaliser({
    userId: profile.id,
    action: "demande_conge",
    cibleType: "demande_conge",
    cibleId: created.id,
    dossierId: profile.dossier_id,
    details: { date_debut, date_fin, jours },
  });

  return NextResponse.json(created as DemandeConge);
}
