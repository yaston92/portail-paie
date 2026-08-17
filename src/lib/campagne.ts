import type { SupabaseClient } from "@supabase/supabase-js";
import { estPresentSurMois, formatDate } from "@/lib/format";
import {
  NATURE_LABELS,
  type Absence,
  type AbsenceNature,
  type Salarie,
  type SaisieVariables,
} from "@/lib/types";

const ORDRE_NATURES: AbsenceNature[] = [
  "cp",
  "maladie",
  "injustifiee",
  "rtt",
  "autre",
];

function jourSuivant(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Compresse des jours ISO en « du 12/08/2026 au 14/08/2026, 19/08/2026 ». */
export function formaterPlagesJours(joursIso: string[]): string {
  const uniques = [...new Set(joursIso.map((j) => j.slice(0, 10)))].sort();
  if (uniques.length === 0) return "";

  const plages: { debut: string; fin: string }[] = [];
  for (const jour of uniques) {
    const derniere = plages[plages.length - 1];
    if (derniere && jourSuivant(derniere.fin) === jour) {
      derniere.fin = jour;
    } else {
      plages.push({ debut: jour, fin: jour });
    }
  }

  return plages
    .map((p) =>
      p.debut === p.fin
        ? formatDate(p.debut)
        : `du ${formatDate(p.debut)} au ${formatDate(p.fin)}`
    )
    .join(", ");
}

/**
 * Détail lisible des absences pour export Excel, regroupé par nature :
 * « Congés payés : du 12/08/2026 au 14/08/2026, 19/08/2026 ; Maladie : 20/08/2026 »
 */
export function formaterDetailJoursAbsences(absences: Absence[]): string {
  if (absences.length === 0) return "";

  const parNature = new Map<AbsenceNature, string[]>();
  for (const a of absences) {
    const liste = parNature.get(a.nature) ?? [];
    liste.push(a.jour);
    parNature.set(a.nature, liste);
  }

  return ORDRE_NATURES.filter((n) => parNature.has(n))
    .map((n) => `${NATURE_LABELS[n]} : ${formaterPlagesJours(parNature.get(n)!)}`)
    .join(" ; ");
}

/** Salariés attendus dans une campagne : présents sur le mois (sortie incluse). */
export async function salariesAttendus(
  supabase: SupabaseClient,
  dossierId: string,
  mois: string
): Promise<Salarie[]> {
  const { data } = await supabase
    .from("salaries")
    .select("*")
    .eq("dossier_id", dossierId)
    .order("nom");
  return ((data ?? []) as Salarie[]).filter((s) => estPresentSurMois(s, mois));
}

/** Une saisie est complète si un mode est choisi (et le net renseigné le cas échéant). */
export function saisieComplete(saisie: SaisieVariables | undefined): boolean {
  if (!saisie || !saisie.mode) return false;
  if (saisie.mode === "net") return saisie.net_montant !== null;
  return true;
}

export interface EtatCampagne {
  attendus: Salarie[];
  saisiesParSalarie: Map<string, SaisieVariables>;
  completes: number;
  incomplets: Salarie[];
}

/** État d'avancement d'une campagne (compteur « 7 sur 9 » et liste des incomplets). */
export async function etatCampagne(
  supabase: SupabaseClient,
  campagneId: string,
  dossierId: string,
  mois: string
): Promise<EtatCampagne> {
  const [attendus, { data: saisies }] = await Promise.all([
    salariesAttendus(supabase, dossierId, mois),
    supabase.from("saisies_variables").select("*").eq("campagne_id", campagneId),
  ]);
  const saisiesParSalarie = new Map(
    ((saisies ?? []) as SaisieVariables[]).map((s) => [s.salarie_id, s])
  );
  const incomplets = attendus.filter(
    (s) => !saisieComplete(saisiesParSalarie.get(s.id))
  );
  return {
    attendus,
    saisiesParSalarie,
    completes: attendus.length - incomplets.length,
    incomplets,
  };
}

/** Totaux d'absences par nature, en jours et en heures. */
export function totauxAbsences(absences: Absence[]) {
  const totaux = new Map<string, { jours: number; heures: number }>();
  for (const a of absences) {
    const t = totaux.get(a.nature) ?? { jours: 0, heures: 0 };
    t.jours += 1;
    t.heures += Number(a.heures);
    totaux.set(a.nature, t);
  }
  return totaux;
}
