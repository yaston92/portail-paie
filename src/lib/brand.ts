/**
 * Identité visuelle ETIK Expertise / ETIK Paie.
 *
 * Thème actuel : `etik` (rouge / bordeaux du logo).
 * Pour revenir au bleu d’origine (sans toucher au reste du code métier) :
 * 1. Mettre `THEME_ACTIF` à `"bleu"`
 * 2. Dans `src/app/globals.css`, remplacer l’import `theme-etik.css` par `theme-bleu.css`
 * 3. Sur mobile, `lib/theme.ts` lit déjà `THEME_ACTIF` via les mêmes constantes (dupliquées).
 *
 * Phrase déclencheur utilisateur : « remets en bleu » / « remet en bleu ».
 */
export type ThemeActif = "etik" | "bleu";

export const THEME_ACTIF: ThemeActif = "etik";

const PALETTE_ETIK = {
  primary: "#C63D2F",
  primaryDark: "#932924",
  primarySoft: "#F4DCDC",
  primaryMuted: "#FCE8E6",
} as const;

/** Valeurs bleues d’origine (avant thème logo). */
const PALETTE_BLEU = {
  primary: "#1d4ed8",
  primaryDark: "#1e3a8a",
  primarySoft: "#dbeafe",
  primaryMuted: "#eff6ff",
} as const;

export const BRAND =
  THEME_ACTIF === "bleu" ? PALETTE_BLEU : PALETTE_ETIK;

export const BRAND_NAME = "ETIK Paie";
