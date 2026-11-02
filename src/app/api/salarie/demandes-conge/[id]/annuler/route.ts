import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import { joursOuvres, retirerAbsencesCp } from "@/lib/demandes-conge";
import { formatDate } from "@/lib/format";
import { prevenirDemandeConge } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DemandeConge } from "@/lib/types";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["salarie"]);
  if (!profile?.salarie_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id } = await context.params;
  const admin = createAdminClient();
  const { data: demande } = await admin
    .from("demandes_conge")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const d = demande as DemandeConge | null;
  if (!d || d.salarie_id !== profile.salarie_id) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }
  if (d.statut === "annulee") {
    return NextResponse.json({ error: "Cette demande est déjà annulée." }, { status: 400 });
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
      statut: "annulee",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nom = `${profile.prenom} ${profile.nom}`.trim() || profile.email;
  await prevenirDemandeConge({
    dossierId: d.dossier_id,
    titre: "Congés retirés",
    corps: `${nom} a retiré sa demande de congés du ${formatDate(d.date_debut)} au ${formatDate(d.date_fin)}.`,
  });

  await journaliser({
    userId: profile.id,
    action: "annulation_demande_conge",
    cibleType: "demande_conge",
    cibleId: id,
    dossierId: d.dossier_id,
  });

  return NextResponse.json(updated as DemandeConge);
}
