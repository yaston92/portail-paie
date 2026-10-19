import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  type EmailOtpType,
} from "@supabase/supabase-js";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ipClient, tropSouvent } from "@/lib/limite";

function messageMotDePasse(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("weak") || m.includes("easy to guess") || m.includes("pwned") || m.includes("leaked")) {
    return "Ce mot de passe est trop courant. Choisissez-en un autre, plus long.";
  }
  if (m.includes("different")) {
    return "Choisissez un mot de passe différent de l'actuel.";
  }
  if (m.includes("at least") || m.includes("should be") || m.includes("characters")) {
    return "Le mot de passe ne respecte pas les règles demandées (10 caractères minimum).";
  }
  return "Impossible d'enregistrer le mot de passe. Réessayez avec un autre mot de passe.";
}

/**
 * Définit le mot de passe après un lien d'invitation ou de récupération.
 * Le jeton est vérifié ici, puis le mot de passe est posé par le client admin :
 * `updateUser` côté navigateur échoue souvent avec « Auth session missing ».
 */
export async function POST(request: Request) {
  if (tropSouvent(`mdp:${ipClient(request)}`, 8, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429 }
    );
  }

  let body: { password?: string; token_hash?: string; type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const password = body.password ?? "";
  if (password.length < 10 || password.length > 200) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 10 caractères." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let userId: string | null = null;
  let email: string | null = null;
  let access_token: string | null = null;
  let refresh_token: string | null = null;

  const tokenHash = body.token_hash?.trim();
  if (tokenHash) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json({ error: "Configuration incomplète." }, { status: 500 });
    }
    const supabase = createSupabaseClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const demande = (body.type || "recovery") as EmailOtpType;
    const candidats: EmailOtpType[] = ["recovery", "invite", "magiclink", "email"].includes(
      demande
    )
      ? [demande, "recovery", "invite", "magiclink"]
      : [demande];
    const vus = new Set<string>();
    for (const type of candidats) {
      if (vus.has(type)) continue;
      vus.add(type);
      const { data, error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!error && data.user) {
        userId = data.user.id;
        email = data.user.email ?? null;
        access_token = data.session?.access_token ?? null;
        refresh_token = data.session?.refresh_token ?? null;
        break;
      }
    }
    if (!userId) {
      return NextResponse.json(
        { error: "Ce lien n'est plus valide. Demandez un nouvel envoi." },
        { status: 400 }
      );
    }
  } else {
    const profile = await getApiProfile();
    if (!profile) {
      return NextResponse.json(
        { error: "Session introuvable. Ouvrez à nouveau le lien reçu par email." },
        { status: 401 }
      );
    }
    userId = profile.id;
    email = profile.email;
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    return NextResponse.json({ error: messageMotDePasse(error.message) }, { status: 400 });
  }

  await admin
    .from("profiles")
    .update({ doit_changer_mot_de_passe: false })
    .eq("id", userId);

  return NextResponse.json({
    ok: true,
    email,
    access_token,
    refresh_token,
  });
}
