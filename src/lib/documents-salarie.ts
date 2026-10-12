export const COMPARTIMENTS_SALARIE = [
  { id: "dpae", label: "DPAE" },
  { id: "contrat", label: "Contrat" },
  { id: "piece_identite_recto", label: "Pièce d'identité (recto)" },
  { id: "piece_identite_verso", label: "Pièce d'identité (verso)" },
  { id: "carte_vitale", label: "Carte vitale" },
  { id: "certificat_travail", label: "Certificat de travail" },
  { id: "stc", label: "STC" },
  { id: "attestation_france_travail", label: "Attestation France Travail" },
  { id: "arret_maladie", label: "Arrêt maladie" },
  { id: "fin_contrat", label: "Fin de contrat" },
  { id: "autre", label: "Documents divers" },
] as const;

export type TypeDocumentSalarie = (typeof COMPARTIMENTS_SALARIE)[number]["id"];

const SENSIBLES = new Set<string>([
  "piece_identite_recto",
  "piece_identite_verso",
  "carte_vitale",
]);

export function estTypeDocumentSalarie(valeur: string): valeur is TypeDocumentSalarie {
  return COMPARTIMENTS_SALARIE.some((c) => c.id === valeur);
}

export function labelDocumentSalarie(type: string): string {
  return COMPARTIMENTS_SALARIE.find((c) => c.id === type)?.label ?? type;
}

export function documentSensible(type: string): boolean {
  return SENSIBLES.has(type);
}
