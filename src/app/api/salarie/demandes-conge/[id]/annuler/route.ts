import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
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
  if (d.statut !== "en_attente") {
    return NextResponse.json(
      { error: "Seule une demande en attente peut être annulée." },
      { status: 400 }
    );
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

  await journaliser({
    userId: profile.id,
    action: "annulation_demande_conge",
    cibleType: "demande_conge",
    cibleId: id,
    dossierId: d.dossier_id,
  });

  return NextResponse.json(updated as DemandeConge);
}
