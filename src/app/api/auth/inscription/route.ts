import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { boutonEmail, envoyerEmail, gabaritEmail } from "@/lib/email";
import { hrefEmail } from "@/lib/lien-activation";
import { creerLien48h, MENTION_LIEN_48H } from "@/lib/lien-duree";
import { ipClient, tropSouvent } from "@/lib/limite";

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

  if (tropSouvent(`inscription:${ipClient(request)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de créations de compte. Réessayez dans une heure." },
      { status: 429 }
    );
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

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email: emailNorm,
    password,
    options: {
      data: {
        role: "directeur",
        nom: nomTrim,
        prenom: prenomTrim,
      },
      redirectTo: `${appUrl}/auth/confirmer-compte`,
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
    return NextResponse.json(
      { error: "Impossible de créer le compte. Vérifiez les informations saisies." },
      { status: 400 }
    );
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
  await admin.from("profiles").update({ email_confirme: false }).eq("id", userId);

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

  const lien = creerLien48h(appUrl, { email: emailNorm, type: "signup" });
  const prenomNom = `${prenomTrim} ${nomTrim}`.trim();
  await envoyerEmail({
    to: [{ email: emailNorm, name: prenomNom }],
    subject: "Confirmez votre compte ETIK Paie",
    html: gabaritEmail(
      "Confirmez votre adresse",
      `Bonjour ${prenomTrim || "Madame, Monsieur"},<br/><br/>` +
        `Pour ouvrir le cabinet « ${cabinetNom} », confirmez votre adresse email. ${MENTION_LIEN_48H}<br/><br/>` +
        boutonEmail(lien, "Confirmer mon compte")
    ),
  });

  return NextResponse.json({
    ok: true,
    verification: true,
  });
}
