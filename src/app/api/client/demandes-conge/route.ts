import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DemandeConge } from "@/lib/types";

/** File des demandes de congés du dossier (client) ou tous dossiers (cabinet). */
export async function GET() {
  const profile = await getApiProfile([
    "client",
    "admin_cabinet",
    "collaborateur",
  ]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("demandes_conge")
    .select(
      "*, salaries(nom, prenom), profiles!demandes_conge_demandeur_id_fkey(prenom, nom)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (profile.role === "client") {
    if (!profile.dossier_id) {
      return NextResponse.json({ error: "Dossier manquant" }, { status: 400 });
    }
    query = query.eq("dossier_id", profile.dossier_id);
  }

  const { data, error } = await query;
  if (error) {
    // Fallback sans jointure si le nom de FK diffère
    let q2 = admin
      .from("demandes_conge")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (profile.role === "client" && profile.dossier_id) {
      q2 = q2.eq("dossier_id", profile.dossier_id);
    }
    const { data: plain } = await q2;
    return NextResponse.json((plain ?? []) as DemandeConge[]);
  }

  return NextResponse.json(data ?? []);
}
