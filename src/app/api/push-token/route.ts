import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Enregistre le jeton push du téléphone connecté. */
export async function POST(request: Request) {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    plateforme?: string;
  };
  const token = (body.token ?? "").trim();
  if (!token.startsWith("ExponentPushToken") && !token.startsWith("ExpoPushToken")) {
    return NextResponse.json({ error: "Jeton invalide" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin.from("push_tokens").upsert(
    {
      user_id: profile.id,
      token,
      plateforme: body.plateforme ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) {
    return NextResponse.json(
      { error: "Jeton non enregistré. Exécutez la migration 0020." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
