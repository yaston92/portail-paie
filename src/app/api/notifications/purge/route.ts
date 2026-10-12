import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Retire les notifications client de plus de 30 jours. */
export async function POST() {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (profile.role !== "client") {
    return NextResponse.json({ ok: true, supprimees: 0 });
  }
  const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();
  const { count } = await admin
    .from("notifications")
    .delete({ count: "exact" })
    .eq("user_id", profile.id)
    .lt("created_at", limite);
  return NextResponse.json({ ok: true, supprimees: count ?? 0 });
}
