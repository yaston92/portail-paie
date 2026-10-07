import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Le salarié a défini son mot de passe : le compte n'est plus « en attente ». */
export async function POST() {
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ doit_changer_mot_de_passe: false })
    .eq("id", profile.id);
  return NextResponse.json({ ok: true });
}
