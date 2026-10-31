import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Remplace le mot de passe provisoire et lève l'obligation de changement.
 * Passe par le client admin : l'app mobile n'a qu'un jeton Bearer, et
 * `updateUser` refuse alors avec « Auth session missing ».
 */
export async function POST(request: Request) {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }
  if (!profile.doit_changer_mot_de_passe) {
    return NextResponse.json({ error: "Aucun changement n'est demandé." }, { status: 400 });
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password ?? "";
  } catch {
    password = "";
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit contenir au moins 8 caractères." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(profile.id, { password });
  if (error) {
    return NextResponse.json(
      { error: "Impossible d'enregistrer le mot de passe." },
      { status: 400 }
    );
  }

  const { error: flagError } = await admin
    .from("profiles")
    .update({ doit_changer_mot_de_passe: false })
    .eq("id", profile.id);
  if (flagError) {
    return NextResponse.json(
      { error: "Mot de passe enregistré, mais la confirmation a échoué. Réessayez." },
      { status: 500 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !profile.email) {
    return NextResponse.json({ ok: true });
  }
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: signError } = await client.auth.signInWithPassword({
    email: profile.email,
    password,
  });
  if (signError || !session.session) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({
    ok: true,
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
  });
}
