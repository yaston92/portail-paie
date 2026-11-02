import { createHmac, timingSafeEqual } from "crypto";

const DUREE_SEC = 10 * 60;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  const s = process.env.LIEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Secret de lien manquant");
  return s;
}

/** Jeton court pour ouvrir un bulletin dans le navigateur du téléphone. */
export function creerJetonLectureBulletin(bulletinId: string): string {
  const exp = Math.floor(Date.now() / 1000) + DUREE_SEC;
  const corps = Buffer.from(JSON.stringify({ id: bulletinId, exp })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(corps).digest("base64url");
  return `${corps}.${sig}`;
}

export function lireJetonLectureBulletin(jeton: string): string | null {
  const point = jeton.lastIndexOf(".");
  if (point <= 0) return null;
  const corps = jeton.slice(0, point);
  const sig = jeton.slice(point + 1);
  const attendu = createHmac("sha256", secret()).update(corps).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(attendu);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(corps, "base64url").toString("utf8")) as {
      id?: string;
      exp?: number;
    };
    if (!data.id || !UUID.test(data.id) || !data.exp) return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.id;
  } catch {
    return null;
  }
}
