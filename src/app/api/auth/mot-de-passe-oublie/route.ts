import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerEmail, gabaritEmail, styleBoutonEmail } from "@/lib/email";

const schema = z.object({
  email: z.string().email(),
  /** Base du deep link mobile, ex. etikpaie://auth/callback ou exp://…/--/auth/callback */
  redirect_to: z.string().min(8).max(500).optional(),
});

function redirectAutorise(url: string): boolean {
  const app = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (app && (url === app || url.startsWith(`${app}/`))) return true;
  if (/^etikpaie:\/\//i.test(url)) return true;
  if (/^exps?:\/\//i.test(url)) return true;
  return false;
}

/**
 * Mot de passe oublié : email Brevo avec lien token_hash (fonctionne sur téléphone,
 * sans dépendre du PKCE du navigateur qui a demandé le reset).
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
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );

  // Réponse uniforme (ne pas révéler si le compte existe)
  const ok = () =>
    NextResponse.json({
      ok: true,
      message:
        "Si un compte existe pour cette adresse, un email de réinitialisation vient d'être envoyé.",
    });

  const admin = createAdminClient();
  const webRedirect = `${appUrl}/auth/callback`;
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: webRedirect },
  });

  // Compte inexistant ou autre : même réponse (pas d'énumération d'emails)
  if (linkError || !linkData) return ok();

  const hashed =
    (linkData as { properties?: { hashed_token?: string } }).properties?.hashed_token ||
    (linkData as { hashed_token?: string }).hashed_token;

  if (!hashed) return ok();

  let lienApp: string | null = null;
  const mobileRedirect = parsed.data.redirect_to?.trim();
  if (mobileRedirect && redirectAutorise(mobileRedirect)) {
    const base = mobileRedirect.split("?")[0]!.replace(/\/$/, "");
    lienApp = `${base}?token_hash=${encodeURIComponent(hashed)}&type=recovery`;
  }
  const lienWeb = `${appUrl}/definir-mot-de-passe?token_hash=${encodeURIComponent(hashed)}&type=recovery`;
  const lienPrincipal = lienApp || lienWeb;

  const corps =
    `Bonjour,<br/><br/>Vous avez demandé à réinitialiser votre mot de passe.` +
    `<br/><br/><a href="${lienPrincipal}" style="${styleBoutonEmail()}">Choisir un nouveau mot de passe</a>` +
    (lienApp
      ? `<p style="font-size:13px;margin-top:16px">Si l’app ne s’ouvre pas, utilisez ce lien dans le navigateur :<br/><a href="${lienWeb}">${lienWeb}</a></p>`
      : "") +
    `<p style="font-size:12px;color:#666;word-break:break-all;margin-top:16px">${lienPrincipal}</p>` +
    `<p style="font-size:12px;color:#666;margin-top:12px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`;

  const envoye = await envoyerEmail({
    to: [{ email }],
    subject: "Réinitialisation de votre mot de passe : ETIK Paie",
    html: gabaritEmail("Réinitialiser votre mot de passe", corps),
  });

  if (!envoye) {
    return NextResponse.json(
      {
        error:
          "Email non envoyé (Brevo). Vérifiez BREVO_API_KEY / EMAIL_FROM sur le serveur.",
      },
      { status: 503 }
    );
  }

  return ok();
}
