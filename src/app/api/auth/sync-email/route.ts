import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Après confirmation d'un email_change : aligne profiles.email
 * (et salaries.email si compte salarié) sur Auth.
 */
export async function POST() {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || user.id !== profile.id) {
    return NextResponse.json({ error: "Session invalide" }, { status: 401 });
  }

  const email = user.email.trim().toLowerCase();
  const admin = createAdminClient();

  await admin.from("profiles").update({ email }).eq("id", user.id);

  if (profile.salarie_id) {
    await admin
      .from("salaries")
      .update({ email })
      .eq("id", profile.salarie_id);
  }

  return NextResponse.json({ ok: true, email });
}
