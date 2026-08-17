/** Clés des jours (lundi → dimanche). */
export const JOURS_SEMAINE = [
  "lun",
  "mar",
  "mer",
  "jeu",
  "ven",
  "sam",
  "dim",
] as const;

export type JourSemaine = (typeof JOURS_SEMAINE)[number];

export type HorairesSemaine = Record<JourSemaine, number>;

export const LABEL_JOUR: Record<JourSemaine, string> = {
  lun: "Lundi",
  mar: "Mardi",
  mer: "Mercredi",
  jeu: "Jeudi",
  ven: "Vendredi",
  sam: "Samedi",
  dim: "Dimanche",
};

export const LABEL_JOUR_COURT: Record<JourSemaine, string> = {
  lun: "Lun",
  mar: "Mar",
  mer: "Mer",
  jeu: "Jeu",
  ven: "Ven",
  sam: "Sam",
  dim: "Dim",
};

/** Défaut : durée hebdo répartie sur lun–ven (sinon 7 h/j). */
export function horairesParDefaut(dureeHebdo: number | null | undefined): HorairesSemaine {
  const h =
    dureeHebdo != null && Number(dureeHebdo) > 0
      ? Math.round((Number(dureeHebdo) / 5) * 100) / 100
      : 7;
  return { lun: h, mar: h, mer: h, jeu: h, ven: h, sam: 0, dim: 0 };
}

/** Normalise un JSON / objet partiel en horaires complets. */
export function normaliserHoraires(
  raw: unknown,
  dureeHebdo?: number | null
): HorairesSemaine {
  const base = horairesParDefaut(dureeHebdo);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const out = { ...base };
  for (const j of JOURS_SEMAINE) {
    const v = o[j];
    if (v === null || v === undefined || v === "") continue;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    if (Number.isFinite(n) && n >= 0 && n <= 24) {
      out[j] = Math.round(n * 100) / 100;
    }
  }
  return out;
}

/** Jour de la semaine pour une date AAAA-MM-JJ (calendrier local). */
export function jourSemaineDepuisDate(ymd: string): JourSemaine {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = dimanche
  const map: JourSemaine[] = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  return map[dow];
}

export function heuresDuJour(
  horaires: HorairesSemaine | null | undefined,
  ymd: string,
  dureeHebdo?: number | null
): number {
  const h = normaliserHoraires(horaires, dureeHebdo);
  return h[jourSemaineDepuisDate(ymd)] ?? 0;
}

export function sommeHebdo(horaires: HorairesSemaine): number {
  return (
    Math.round(
      JOURS_SEMAINE.reduce((s, j) => s + (Number(horaires[j]) || 0), 0) * 100
    ) / 100
  );
}

/** Salarié encore dans l'effectif à la date donnée. */
export function estActifLeJour(
  salarie: { date_entree: string | null; date_sortie: string | null },
  jour: string
): boolean {
  if (salarie.date_entree && salarie.date_entree > jour) return false;
  if (salarie.date_sortie && salarie.date_sortie < jour) return false;
  return true;
}
