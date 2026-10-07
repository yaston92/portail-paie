import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Le cabinet a traité l'arrêt : il passe dans l'historique. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["directeur", "admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin
    .from("arrets_maladie")
    .update({
      traite_at: new Date().toISOString(),
      traite_par: profile.id,
    })
    .eq("id", id)
    .is("traite_at", null);
  if (error) {
    return NextResponse.json({ error: "Échec de l'enregistrement." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
