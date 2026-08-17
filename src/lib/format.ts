export const MOIS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

/** '2026-09-01' -> 'Septembre 2026' */
export function moisLabel(mois: string): string {
  const d = new Date(mois + "T00:00:00");
  return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

/** '2026-09-01' -> '09.2026' (format des noms de fichiers bulletins) */
export function moisFichier(mois: string): string {
  const [y, m] = mois.split("-");
  return `${m}.${y}`;
}

/** '2026-09-01' -> '2026-09' (segment d'URL) */
export function moisVersParam(mois: string): string {
  return mois.slice(0, 7);
}

/** '2026-09' ou '2026-09-01' -> '2026-09-01', sinon null */
export function moisDepuisParam(param: string): string | null {
  if (/^\d{4}-\d{2}-01$/.test(param)) return param;
  if (/^\d{4}-\d{2}$/.test(param)) return `${param}-01`;
  return null;
}

/** Premier jour du mois courant, en 'YYYY-MM-01' */
export function moisCourant(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date + (date.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("fr-FR");
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Date courte (année sur 2 chiffres), ex. 17/08/26. */
export function formatDateCourte(date: string | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date + (date.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function formatMontant(montant: number | null | undefined): string {
  if (montant === null || montant === undefined) return "-";
  return montant.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

export function formatHeures(heures: number | null | undefined): string {
  if (heures === null || heures === undefined) return "-";
  return `${heures.toLocaleString("fr-FR")} h`;
}

/** Nom de fichier bulletin : 'OPT - DUPONT Marie 09.2026.pdf' */
export function nomFichierBulletin(
  sigle: string,
  nom: string,
  prenom: string,
  mois: string
): string {
  return `${sigle.toUpperCase()} - ${nom.toUpperCase()} ${prenom} ${moisFichier(mois)}.pdf`;
}

/**
 * Un salarié sorti reste visible sur son mois de sortie (solde de tout compte)
 * et disparaît de la liste active le mois suivant.
 */
export function estPresentSurMois(
  salarie: { date_entree: string | null; date_sortie: string | null },
  mois: string
): boolean {
  const finMois = new Date(mois + "T00:00:00");
  finMois.setMonth(finMois.getMonth() + 1);
  if (salarie.date_entree && new Date(salarie.date_entree) >= finMois) return false;
  if (salarie.date_sortie) {
    const moisSortie = salarie.date_sortie.slice(0, 7);
    if (mois.slice(0, 7) > moisSortie) return false;
  }
  return true;
}

/** Validation basique d'un NIR (13 ou 15 chiffres, clé non vérifiée). */
export function nirValide(nir: string): boolean {
  const clean = nir.replace(/[\s.]/g, "");
  return /^[12][0-9]{12}([0-9]{2})?$/.test(clean);
}
