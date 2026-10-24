/**
 * Lien d'activation collé dans un email.
 * Le jeton est en premier : si le logiciel de mail coupe au « & »,
 * le site retrouve quand même le token et suppose une récupération de mot de passe.
 */
export function lienActivation(
  appUrl: string,
  chemin: string,
  tokenHash: string,
  type: string
): string {
  const base = appUrl.replace(/\/$/, "");
  const url = new URL(chemin.startsWith("/") ? chemin : `/${chemin}`, `${base}/`);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}

/** Dans un href HTML, « & » doit être écrit « &amp; » sinon le mail tronque l'adresse. */
export function hrefEmail(url: string): string {
  return url.replace(/&/g, "&amp;");
}

/** Lit le jeton même si « &type » a été transformé en « &amp;type » ou supprimé. */
export function lireJetonActivation(
  search: string
): { token_hash: string; type: string } | null {
  const brut = (search.startsWith("?") ? search.slice(1) : search).replace(
    /&amp;/gi,
    "&"
  );
  const params = new URLSearchParams(brut);
  let token = params.get("token_hash") ?? "";
  const coupe = token.split(/&type=/i);
  token = (coupe[0] ?? "").trim();
  const typeColle = coupe[1]?.split("&")[0]?.trim();
  const type =
    params.get("type") || params.get("amp;type") || typeColle || "recovery";
  if (!token) return null;
  return { token_hash: token, type };
}
