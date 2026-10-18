import { NextResponse } from "next/server";
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

  return NextResponse.json({ ok: true });
}
