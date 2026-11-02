import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Marque une notification comme traitée ou pas encore. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { traite?: boolean } | null;
  if (typeof body?.traite !== "boolean") {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin
    .from("notifications")
    .update({ traite: body.traite })
    .eq("id", id)
    .eq("user_id", profile.id);
  if (error) {
    return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

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
