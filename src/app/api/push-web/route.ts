import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Enregistre le navigateur de l'ordinateur connecté. */
export async function POST(request: Request) {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;
  const endpoint = body?.endpoint?.trim() ?? "";
  const p256dh = body?.keys?.p256dh?.trim() ?? "";
  const auth = body?.keys?.auth?.trim() ?? "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ error: "Abonnement invalide" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin.from("web_push_abonnements").upsert(
    {
      user_id: profile.id,
      endpoint,
      p256dh,
      auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    return NextResponse.json(
      { error: "Navigateur non enregistré. Exécutez la migration 0024." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
