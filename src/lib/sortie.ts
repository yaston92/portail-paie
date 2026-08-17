import { formatDate } from "@/lib/format";

/** Motifs de sortie déclarables (client ou cabinet). */
export const MOTIFS_SORTIE = [
  {
    value: "licenciement_simple",
    label: "Licenciement (simple)",
  },
  {
    value: "licenciement_faute_grave",
    label: "Licenciement pour faute grave",
  },
  {
    value: "licenciement_faute_lourde",
    label: "Licenciement pour faute lourde",
  },
  {
    value: "demission",
    label: "Démission",
  },
  {
    value: "rupture_conventionnelle",
    label: "Rupture conventionnelle",
  },
] as const;

export type MotifSortie = (typeof MOTIFS_SORTIE)[number]["value"];

export function estMotifSortie(v: string): v is MotifSortie {
  return MOTIFS_SORTIE.some((m) => m.value === v);
}

export function labelMotifSortie(v: string | null | undefined): string {
  if (!v) return "-";
  return MOTIFS_SORTIE.find((m) => m.value === v)?.label ?? v;
}

/** Texte standard pour les récaps paie (Excel / PDF / note de saisie). */
export function texteNoteSortie(salarie: {
  date_sortie: string | null | undefined;
  motif_sortie: string | null | undefined;
}): string | null {
  if (!salarie.date_sortie) return null;
  return `SORTIE : ${labelMotifSortie(salarie.motif_sortie)} au ${formatDate(salarie.date_sortie)}`;
}

/**
 * Fusionne la note libre de saisie avec la mention de sortie
 * (toujours en tête pour les gestionnaires de paie).
 */
export function composerNoteAvecSortie(
  noteSaisie: string | null | undefined,
  salarie: {
    date_sortie: string | null | undefined;
    motif_sortie: string | null | undefined;
  }
): string {
  const sortie = texteNoteSortie(salarie);
  const note = (noteSaisie ?? "").trim();
  if (!sortie) return note;
  if (!note) return sortie;
  // Évite le doublon si la sortie a déjà été injectée dans la saisie
  if (/(^|\n)\s*SORTIE\s*:/i.test(note)) return note;
  return `${sortie}\n${note}`;
}
