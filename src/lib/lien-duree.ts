import { createHmac, timingSafeEqual } from "crypto";

/** Durée de vie des liens envoyés par email (invitation, mot de passe, confirmation). */
export const DUREE_LIEN_SEC = 48 * 60 * 60;

export const MENTION_LIEN_48H = "Ce lien reste valable 48 heures.";

export type TypeLienDurable =
  | "recovery"
  | "signup"
  | "invite"
  | "magiclink"
  | "email_change";

type JetonLien = {
  email: string;
  type: TypeLienDurable;
  exp: number;
  dest?: string;
  nouveau?: string;
};

function secret(): string {
  const s = process.env.LIEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Secret de lien manquant");
  return s;
}

/**
 * Lien https du site, sans jeton Supabase.
 * Au clic, le serveur vérifie la signature et fabrique un jeton frais.
 */
export function creerLien48h(
  appUrl: string,
  data: { email: string; type: TypeLienDurable; dest?: string; nouveau?: string }
): string {
  const payload: JetonLien = {
    email: data.email.trim().toLowerCase(),
    type: data.type,
    exp: Math.floor(Date.now() / 1000) + DUREE_LIEN_SEC,
  };
  if (data.dest) payload.dest = data.dest;
  if (data.nouveau) payload.nouveau = data.nouveau.trim().toLowerCase();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  const base = appUrl.replace(/\/$/, "");
  const url = new URL("/auth/lien", `${base}/`);
  url.searchParams.set("j", `${body}.${sig}`);
  return url.toString();
}

export function lireLien48h(j: string | null): JetonLien | null {
  if (!j) return null;
  const i = j.lastIndexOf(".");
  if (i <= 0) return null;
  const body = j.slice(0, i);
  const sig = j.slice(i + 1);
  let attendu: string;
  try {
    attendu = createHmac("sha256", secret()).update(body).digest("base64url");
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(attendu);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as JetonLien;
    if (!data.email || !data.type || !data.exp) return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}
