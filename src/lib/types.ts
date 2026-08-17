export type UserRole =
  | "directeur"
  | "admin_cabinet"
  | "collaborateur"
  | "client"
  | "salarie";
export type CabinetRoleMembre = "admin" | "collaborateur";
export type ContratType = "cdi" | "cdd";
export type EmbaucheStatut = "envoye" | "retourne" | "valide";
export type CampagneStatut =
  | "ouverte"
  | "cloturee_identique"
  | "envoyee"
  | "bulletins_envoyes";
export type SaisieMode = "net" | "variables" | "ras";
export type AbsenceNature = "cp" | "maladie" | "injustifiee" | "rtt" | "autre";
export type SalarieStatut = "actif" | "sorti";
export type UploadStatut = "en_controle" | "publie";

/** Rôles côté cabinet (staff). */
export const ROLES_CABINET: UserRole[] = [
  "directeur",
  "admin_cabinet",
  "collaborateur",
];

export function isCabinetRole(role: UserRole): boolean {
  return ROLES_CABINET.includes(role);
}

export interface Profile {
  id: string;
  role: UserRole;
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  dossier_id: string | null;
  salarie_id: string | null;
  created_at: string;
}

export interface Cabinet {
  id: string;
  nom: string;
  archive: boolean;
  created_at: string;
}

export interface CabinetMembre {
  cabinet_id: string;
  profile_id: string;
  role_membre: CabinetRoleMembre;
  created_at: string;
}

export interface Dossier {
  id: string;
  cabinet_id: string;
  sigle: string;
  raison_sociale: string;
  email: string | null;
  telephone: string | null;
  collaborateur_id: string | null;
  archive: boolean;
  created_at: string;
}

export interface Salarie {
  id: string;
  dossier_id: string;
  matricule: string | null;
  nom: string;
  prenom: string;
  email: string | null;
  date_entree: string | null;
  date_sortie: string | null;
  motif_sortie: string | null;
  statut: SalarieStatut;
  type_contrat: ContratType | null;
  cdd_duree: string | null;
  duree_hebdo: number | null;
  /** Heures par jour (lun–dim). Null = défaut depuis duree_hebdo. */
  horaires?: Record<string, number> | null;
  poste: string | null;
  opposition_bulletin: boolean;
  profile_id: string | null;
  created_at: string;
}

export interface SalarieDocument {
  id: string;
  salarie_id: string;
  dossier_id: string;
  type_document: string;
  chemin: string;
  nom_fichier: string;
  sensible: boolean;
  uploaded_by: string | null;
  created_at: string;
}

export interface Embauche {
  id: string;
  dossier_id: string;
  statut: EmbaucheStatut;
  nom: string;
  prenom: string;
  nir: string | null;
  carte_vitale_chemin: string | null;
  piece_identite_recto_chemin: string;
  piece_identite_verso_chemin: string;
  date_debut: string;
  type_contrat: ContratType;
  cdd_duree: string | null;
  duree_hebdo: number;
  salaire: number | null;
  salaire_minimum: boolean;
  poste: string;
  note: string | null;
  commentaire_retour: string | null;
  salarie_id: string | null;
  created_by: string | null;
  validated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campagne {
  id: string;
  dossier_id: string;
  mois: string;
  date_limite: string;
  statut: CampagneStatut;
  paies_identiques: boolean | null;
  envoyee_at: string | null;
  recap_chemin: string | null;
  derniere_relance_at: string | null;
  created_at: string;
}

export interface SaisieVariables {
  id: string;
  campagne_id: string;
  salarie_id: string;
  dossier_id: string;
  mode: SaisieMode | null;
  net_montant: number | null;
  heures_supp: number | null;
  note: string | null;
  updated_at: string;
}

export interface Absence {
  id: string;
  saisie_id: string;
  dossier_id: string;
  jour: string;
  nature: AbsenceNature;
  heures: number;
}

export interface Note {
  id: string;
  dossier_id: string;
  campagne_id: string | null;
  salarie_id: string | null;
  auteur_id: string;
  contenu: string;
  piece_chemin: string | null;
  piece_nom: string | null;
  created_at: string;
}

export interface BulletinUpload {
  id: string;
  dossier_id: string;
  mois: string;
  chemin: string;
  nb_pages: number | null;
  statut: UploadStatut;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
}

export interface BulletinSegment {
  id: string;
  upload_id: string;
  page_debut: number;
  page_fin: number;
  salarie_id: string | null;
  cp_acquis: number | null;
  cp_pris: number | null;
  cp_restant: number | null;
  cp_acquis_n1: number | null;
  cp_acquis_n: number | null;
  cp_pris_n1: number | null;
  cp_pris_n: number | null;
  texte_apercu: string | null;
}

export interface Bulletin {
  id: string;
  dossier_id: string;
  salarie_id: string;
  mois: string;
  chemin: string;
  nom_fichier: string;
  upload_id: string | null;
  published_at: string;
}

export interface SoldeCp {
  salarie_id: string;
  dossier_id: string;
  acquis: number | null;
  pris: number | null;
  restant: number | null;
  acquis_n1: number | null;
  acquis_n: number | null;
  pris_n1: number | null;
  pris_n: number | null;
  source: "extraction" | "manuel";
  mois_reference: string | null;
  updated_at: string;
  previsionnel?: number | null;
}

export type DemandeCongeStatut =
  | "en_attente"
  | "validee"
  | "refusee"
  | "annulee";

export interface DemandeConge {
  id: string;
  salarie_id: string;
  dossier_id: string;
  demandeur_id: string;
  date_debut: string;
  date_fin: string;
  jours: number;
  commentaire: string | null;
  statut: DemandeCongeStatut;
  decideur_id: string | null;
  decision_commentaire: string | null;
  decided_at: string | null;
  pending_sync: string[];
  created_at: string;
  updated_at: string;
}

export interface ArretMaladie {
  id: string;
  salarie_id: string;
  dossier_id: string;
  declarant_id: string;
  date_debut: string;
  date_fin: string;
  jours: number;
  justificatif_chemin: string | null;
  justificatif_nom: string | null;
  pending_sync: string[];
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  titre: string;
  corps: string | null;
  lien: string | null;
  lu: boolean;
  created_at: string;
}

export const NATURE_LABELS: Record<AbsenceNature, string> = {
  cp: "Congés payés",
  maladie: "Maladie",
  injustifiee: "Absence injustifiée",
  rtt: "RTT",
  autre: "Autre",
};

export const NATURE_COLORS: Record<AbsenceNature, string> = {
  cp: "bg-blue-500",
  maladie: "bg-amber-500",
  injustifiee: "bg-red-500",
  rtt: "bg-violet-500",
  autre: "bg-gray-500",
};
