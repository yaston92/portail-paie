import type { AbsenceNature } from "@/lib/types";

export type PlanningStatut = "present" | "absent" | "repos";

export type PlanningLigne = {
  salarie_id: string;
  nom: string;
  prenom: string;
  poste: string | null;
  statut: PlanningStatut;
  heures_prevues: number;
  motif: string | null;
  nature: AbsenceNature | "cp_attente" | null;
};
