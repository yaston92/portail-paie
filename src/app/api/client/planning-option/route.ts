import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Le client active ou coupe le planning. Désactivé par défaut. */
export async function POST(request: Request) {
  const profile = await getApiProfile(["client"]);
  if (!profile?.dossier_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { actif?: boolean };
  const admin = createAdminClient();
  const { error } = await admin
    .from("dossiers")
    .update({ planning_actif: body.actif === true })
    .eq("id", profile.dossier_id);
  if (error) {
    return NextResponse.json(
      { error: "Activation impossible. Exécutez la migration 0023 dans l'éditeur SQL." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, actif: body.actif === true });
}
