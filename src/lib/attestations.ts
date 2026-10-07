export const TYPES_ATTESTATION = [
  { id: "vigilance", label: "Attestation de vigilance" },
  { id: "fiscale", label: "Attestation fiscale" },
  { id: "probtp", label: "Pro BTP" },
  { id: "cibtp", label: "CIBTP" },
] as const;

export type TypeAttestation = (typeof TYPES_ATTESTATION)[number]["id"];

export function estTypeAttestation(valeur: string): valeur is TypeAttestation {
  return TYPES_ATTESTATION.some((t) => t.id === valeur);
}

export interface AttestationDossier {
  id: string;
  dossier_id: string;
  type: TypeAttestation;
  nom_fichier: string;
  created_at: string;
}
