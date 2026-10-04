import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";

/** Envoi d'emails transactionnels via l'API Brevo. */

interface EmailParams {
  to: { email: string; name?: string }[];
  subject: string;
  html: string;
  /** Version texte : les filtres anti-spam pénalisent le HTML seul. */
  text?: string;
  replyTo?: { email: string; name?: string };
}

function htmlVersTexte(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>.*?<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function envoyerEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: EmailParams): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("[email] BREVO_API_KEY absente : email non envoyé :", subject);
    return false;
  }
  const from = process.env.EMAIL_FROM || "";
  if (!from || from.endsWith("@example.com")) {
    console.error(
      "[email] EMAIL_FROM absent ou non vérifié : les messages partent en indésirables."
    );
    return false;
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: from,
        name: process.env.EMAIL_FROM_NAME || "ETIK Paie",
      },
      to,
      subject,
      htmlContent: html,
      textContent: text ?? htmlVersTexte(html),
      replyTo: replyTo ?? {
        email: LEGAL.emailContact,
        name: "ETIK Paie",
      },
    }),
  });
  if (!res.ok) {
    console.error("[email] Échec Brevo :", res.status, await res.text());
    return false;
  }
  return true;
}

export function gabaritEmail(titre: string, corps: string, lien?: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const couleur = BRAND.primary;
  const bouton = lien
    ? `<p style="margin:24px 0"><a href="${appUrl}${lien}" style="background:${couleur};color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Ouvrir le portail</a></p>`
    : "";
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h2 style="color:${couleur}">${titre}</h2>
    <p>${corps}</p>
    ${bouton}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
    <p style="color:#6b7280;font-size:12px">Message automatique du portail paie : merci de ne pas répondre directement à cet email.</p>
  </div>`;
}

/** Style bouton CTA emails (couleur marque active). */
export function styleBoutonEmail(): string {
  return `background:${BRAND.primary};color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none`;
}
