import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  nom: z.string().min(1).max(100),
  prenom: z.string().min(1).max(100),
  /** Nom du premier cabinet (optionnel). */
  cabinet_nom: z.string().trim().max(120).optional(),
});

/**
 * Inscription publique : crée un compte **directeur** + un premier cabinet.
 * Les accès Admin / Collaborateur / autre Directeur se donnent ensuite via Équipe.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides" },
      { status: 400 }
    );
  }

  const { email, password, nom, prenom } = parsed.data;
  const admin = createAdminClient();
  const emailNorm = email.trim().toLowerCase();
  const nomTrim = nom.trim();
  const prenomTrim = prenom.trim();
  const cabinetNom =
    parsed.data.cabinet_nom?.trim() ||
    `Cabinet ${prenomTrim || nomTrim}`.trim() ||
    "Mon cabinet";

  const { data, error } = await admin.auth.admin.createUser({
    email: emailNorm,
    password,
    email_confirm: true,
    user_metadata: {
      role: "directeur",
      nom: nomTrim,
      prenom: prenomTrim,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cet email." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const userId = data.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Compte créé sans identifiant" }, { status: 500 });
  }

  // S'assurer que le profil est bien directeur (trigger handle_new_user)
  await admin
    .from("profiles")
    .update({ role: "directeur", nom: nomTrim, prenom: prenomTrim })
    .eq("id", userId);

  const { data: cabinet, error: cabErr } = await admin
    .from("cabinets")
    .insert({ nom: cabinetNom })
    .select("id")
    .single();

  if (cabErr || !cabinet) {
    return NextResponse.json(
      {
        error:
          cabErr?.message ??
          "Compte créé mais cabinet impossible à créer. Contactez le support.",
      },
      { status: 500 }
    );
  }

  const { error: membreErr } = await admin.from("cabinet_membres").insert({
    cabinet_id: cabinet.id,
    profile_id: userId,
    role_membre: "admin",
  });

  if (membreErr) {
    return NextResponse.json(
      { error: membreErr.message },
      { status: 500 }
    );
  }

  const prenomNom = `${prenomTrim} ${nomTrim}`.trim();
  await envoyerEmail({
    to: [{ email: emailNorm, name: prenomNom }],
    subject: "Bienvenue sur ETIK Paie",
    html: gabaritEmail(
      "Compte directeur créé",
      `Bonjour ${prenomTrim || "Madame, Monsieur"},<br/><br/>` +
        `Votre compte <strong>directeur</strong> a bien été créé sur ETIK Paie, ` +
        `avec le cabinet « ${cabinetNom} ». ` +
        `Vous pouvez vous connecter et inviter des administrateurs ou collaborateurs.`,
      "/login"
    ),
  });

  return NextResponse.json({
    ok: true,
    userId,
    cabinet_id: cabinet.id,
  });
}
