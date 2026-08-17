import { NextResponse } from "next/server";
import { z } from "zod";
import { envoyerEmail } from "@/lib/email";
import { LEGAL } from "@/lib/legal";

const schema = z.object({
  nom: z.string().trim().min(1, "Nom requis").max(120),
  email: z.string().trim().email("Email invalide").max(200),
  message: z.string().trim().min(10, "Message trop court").max(4000),
  /** Honeypot anti-spam : doit rester vide. */
  site: z.string().max(0).optional().default(""),
});

const recent = new Map<string, number[]>();

function tropDeRequetes(ip: string): boolean {
  const now = Date.now();
  const fenetre = 60 * 60 * 1000;
  const liste = (recent.get(ip) ?? []).filter((t) => now - t < fenetre);
  if (liste.length >= 8) {
    recent.set(ip, liste);
    return true;
  }
  liste.push(now);
  recent.set(ip, liste);
  return false;
}

function echapper(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Formulaire public : signalement de problème à l'éditeur. */
export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (tropDeRequetes(ip)) {
    return NextResponse.json(
      { error: "Trop de messages. Réessayez dans une heure." },
      { status: 429 }
    );
  }

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

  const { nom, email, message } = parsed.data;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2>Signalement ${echapper(LEGAL.application)}</h2>
      <p><strong>Nom :</strong> ${echapper(nom)}</p>
      <p><strong>Email :</strong> ${echapper(email)}</p>
      <p><strong>Message :</strong></p>
      <p style="white-space:pre-wrap">${echapper(message)}</p>
    </div>
  `;

  const ok = await envoyerEmail({
    to: [{ email: LEGAL.emailSupport, name: LEGAL.editeur }],
    subject: `[${LEGAL.application}] Signalement de ${nom}`,
    html,
    replyTo: { email, name: nom },
  });

  if (!ok) {
    return NextResponse.json(
      { error: "Envoi impossible. Réessayez ou écrivez à " + LEGAL.emailSupport },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true });
}
