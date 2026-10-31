import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Marque l'adresse comme confirmée après le clic sur le lien d'inscription. */
export async function POST() {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  const admin = createAdminClient();
  await admin.from("profiles").update({ email_confirme: true }).eq("id", profile.id);
  return NextResponse.json({ ok: true });
}
