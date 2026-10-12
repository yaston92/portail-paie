import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Supprime une notification de l'utilisateur connecté. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", profile.id);
  if (error) {
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
