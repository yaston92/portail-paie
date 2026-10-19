const seaux = new Map<string, number[]>();

/** Limite simple par clé (IP + action). Suffisant pour freiner un abus sur une instance. */
export function tropSouvent(cle: string, max: number, fenetreMs: number): boolean {
  const now = Date.now();
  const liste = (seaux.get(cle) ?? []).filter((t) => now - t < fenetreMs);
  if (liste.length >= max) {
    seaux.set(cle, liste);
    return true;
  }
  liste.push(now);
  seaux.set(cle, liste);
  if (seaux.size > 5000) {
    const plusVieille = seaux.keys().next().value;
    if (plusVieille) seaux.delete(plusVieille);
  }
  return false;
}

export function ipClient(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
