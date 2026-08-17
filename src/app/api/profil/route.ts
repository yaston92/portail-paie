import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import {
  envoyerEmail,
  gabaritEmail,
  styleBoutonEmail,
} from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { supprimerCompteUtilisateur } from "@/lib/supprimer-compte";

const schema = z.object({
  nom: z.string().trim().min(1, "Nom requis").max(100),
  prenom: z.string().trim().max(100).optional().default(""),
  email: z.string().trim().email("Email invalide").max(200),
  telephone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  /** Deep link mobile pour confirmer le nouvel email. */
  redirect_to: z.string().min(8).max(500).optional(),
});

function redirectAutorise(url: string): boolean {
  const app = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (app && (url === app || url.startsWith(`${app}/`))) return true;
  if (/^etikpaie:\/\//i.test(url)) return true;
  if (/^exps?:\/\//i.test(url)) return true;
  return false;
}

/** Extrait le token de vérification (action_link prioritaire pour email_change_new). */
function extraireTokenHash(linkData: unknown): string | null {
  const props = (linkData as { properties?: Record<string, string> })?.properties;
  const actionLink = props?.action_link;
  if (actionLink) {
    try {
      const u = new URL(actionLink);
      const token =
        u.searchParams.get("token") || u.searchParams.get("token_hash");
      if (token) return token;
    } catch {
      /* ignore */
    }
  }
  return (
    props?.hashed_token ||
    (linkData as { hashed_token?: string })?.hashed_token ||
    null
  );
}

/**
 * Mise à jour du profil (nom, prénom, téléphone).
 * Changement d'email : envoi d'un mail d'activation à la nouvelle adresse ;
 * l'email actuel reste inchangé tant que le lien n'est pas confirmé.
 */
export async function PATCH(request: Request) {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Données invalides" },
      { status: 400 }
    );
  }

  const { nom, prenom, telephone } = body.data;
  const email = body.data.email.toLowerCase();
  const emailChange = email !== profile.email.toLowerCase();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );

  if (emailChange) {
    const admin = createAdminClient();
    const { data: conflit } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .neq("id", profile.id)
      .maybeSingle();
    if (conflit) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé par un autre compte" },
        { status: 409 }
      );
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "email_change_new",
      email: profile.email,
      newEmail: email,
      options: { redirectTo: `${appUrl}/auth/confirmer-email` },
    });

    if (linkError || !linkData) {
      const msg = (linkError?.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return NextResponse.json(
          { error: "Cet email est déjà utilisé par un autre compte" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: linkError?.message || "Impossible de préparer le changement d'email" },
        { status: 500 }
      );
    }

    const hashed = extraireTokenHash(linkData);
    if (!hashed) {
      return NextResponse.json(
        { error: "Impossible de préparer le lien d'activation" },
        { status: 500 }
      );
    }

    let lienApp: string | null = null;
    const mobileRedirect = body.data.redirect_to?.trim();
    if (mobileRedirect && redirectAutorise(mobileRedirect)) {
      const base = mobileRedirect.split("?")[0]!.replace(/\/$/, "");
      lienApp = `${base}?token_hash=${encodeURIComponent(hashed)}&type=email_change`;
    }
    const lienWeb = `${appUrl}/auth/confirmer-email?token_hash=${encodeURIComponent(hashed)}&type=email_change`;
    const lienPrincipal = lienApp || lienWeb;

    const prenomAffiche = (prenom || profile.prenom || "").trim();
    const corps =
      `Bonjour${prenomAffiche ? ` ${prenomAffiche}` : ""},` +
      `<br/><br/>Vous avez demandé à utiliser <strong>${email}</strong> comme nouvelle adresse de connexion sur ETIK Paie.` +
      `<br/><br/>Cliquez sur le bouton ci-dessous pour activer cette adresse. Tant que vous n'avez pas confirmé, votre adresse actuelle (<strong>${profile.email}</strong>) reste active.` +
      `<br/><br/><a href="${lienPrincipal}" style="${styleBoutonEmail()}">Activer mon nouvel email</a>` +
      (lienApp
        ? `<p style="font-size:13px;margin-top:16px">Si l’app ne s’ouvre pas, utilisez ce lien dans le navigateur :<br/><a href="${lienWeb}">${lienWeb}</a></p>`
        : "") +
      `<p style="font-size:12px;color:#666;margin-top:12px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`;

    const envoye = await envoyerEmail({
      to: [{ email, name: `${prenom} ${nom}`.trim() || undefined }],
      subject: "Confirmez votre nouvel email : ETIK Paie",
      html: gabaritEmail("Activer votre nouvel email", corps),
    });

    if (!envoye) {
      return NextResponse.json(
        {
          error:
            "Email d'activation non envoyé (Brevo). Vérifiez BREVO_API_KEY / EMAIL_FROM.",
        },
        { status: 503 }
      );
    }
  }

  // Ne jamais écrire le nouvel email dans profiles tant qu'il n'est pas confirmé.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ nom, prenom, telephone })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Mise à jour impossible" },
      { status: 500 }
    );
  }

  await journaliser({
    userId: profile.id,
    action: emailChange ? "profil_email_demande" : "profil_modifie",
    cibleType: "profile",
    cibleId: profile.id,
    details: emailChange
      ? { email_actuel: profile.email, email_demande: email }
      : undefined,
  });

  return NextResponse.json({
    ok: true,
    profile: data,
    emailPending: emailChange,
    emailPendingAddress: emailChange ? email : undefined,
  });
}

/** Suppression du compte de l'utilisateur connecté (web + mobile). */
export async function DELETE() {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    await supprimerCompteUtilisateur(profile.id);
  } catch (e) {
    console.error("[profil] suppression:", e);
    return NextResponse.json(
      { error: "Suppression impossible. Réessayez ou contactez le support." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
