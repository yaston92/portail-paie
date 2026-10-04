import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import {
  estActifLeJour,
  heuresDuJour,
  normaliserHoraires,
} from "@/lib/horaires";
import { createClient } from "@/lib/supabase/server";
import type { AbsenceNature, Salarie } from "@/lib/types";
import type { PlanningLigne } from "@/lib/planning";

export const runtime = "nodejs";

/** Présences / absences du dossier pour un jour donné. */
export async function GET(request: Request) {
  const profile = await getApiProfile(["client"]);
  if (!profile?.dossier_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const url = new URL(request.url);
  const jour = url.searchParams.get("jour");
  if (!jour || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    return NextResponse.json({ error: "Paramètre jour invalide" }, { status: 400 });
  }

  const supabase = await createClient();
  const dossierId = profile.dossier_id;

  const [{ data: salariesData }, { data: conges }, { data: arrets }, { data: absences }] =
    await Promise.all([
      supabase
        .from("salaries")
        .select(
          "id, nom, prenom, poste, date_entree, date_sortie, duree_hebdo, horaires, statut"
        )
        .eq("dossier_id", dossierId)
        .order("nom"),
      supabase
        .from("demandes_conge")
        .select("salarie_id, date_debut, date_fin, statut")
        .eq("dossier_id", dossierId)
        .lte("date_debut", jour)
        .gte("date_fin", jour)
        .in("statut", ["validee", "en_attente"]),
      supabase
        .from("arrets_maladie")
        .select("salarie_id, date_debut, date_fin")
        .eq("dossier_id", dossierId)
        .lte("date_debut", jour)
        .gte("date_fin", jour),
      supabase
        .from("absences")
        .select("nature, saisies_variables!inner(salarie_id)")
        .eq("dossier_id", dossierId)
        .eq("jour", jour),
    ]);

  const salaries = ((salariesData ?? []) as Salarie[]).filter((s) =>
    estActifLeJour(s, jour)
  );

  const absenceParSalarie = new Map<string, AbsenceNature>();
  for (const a of absences ?? []) {
    const saisie = (
      a as {
        nature: AbsenceNature;
        saisies_variables:
          | { salarie_id: string }
          | { salarie_id: string }[]
          | null;
      }
    ).saisies_variables;
    const joint = Array.isArray(saisie) ? saisie[0] : saisie;
    if (joint?.salarie_id) absenceParSalarie.set(joint.salarie_id, a.nature as AbsenceNature);
  }

  const maladieSet = new Set((arrets ?? []).map((a) => a.salarie_id as string));
  const cpValidee = new Set(
    (conges ?? [])
      .filter((c) => c.statut === "validee")
      .map((c) => c.salarie_id as string)
  );
  const cpAttente = new Set(
    (conges ?? [])
      .filter((c) => c.statut === "en_attente")
      .map((c) => c.salarie_id as string)
  );

  const lignes: PlanningLigne[] = salaries.map((s) => {
    const heures = heuresDuJour(
      normaliserHoraires(s.horaires, s.duree_hebdo),
      jour,
      s.duree_hebdo
    );

    if (heures <= 0) {
      return {
        salarie_id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        poste: s.poste,
        statut: "repos" as const,
        heures_prevues: 0,
        motif: "Jour non travaillé",
        nature: null,
      };
    }

    const natureCampagne = absenceParSalarie.get(s.id);
    if (maladieSet.has(s.id) || natureCampagne === "maladie") {
      return {
        salarie_id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        poste: s.poste,
        statut: "absent" as const,
        heures_prevues: heures,
        motif: "Arrêt maladie",
        nature: "maladie",
      };
    }
    if (cpValidee.has(s.id) || natureCampagne === "cp") {
      return {
        salarie_id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        poste: s.poste,
        statut: "absent" as const,
        heures_prevues: heures,
        motif: "Congés payés",
        nature: "cp",
      };
    }
    if (natureCampagne) {
      return {
        salarie_id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        poste: s.poste,
        statut: "absent" as const,
        heures_prevues: heures,
        motif:
          natureCampagne === "rtt"
            ? "RTT"
            : natureCampagne === "injustifiee"
              ? "Absence injustifiée"
              : "Absence",
        nature: natureCampagne,
      };
    }
    if (cpAttente.has(s.id)) {
      return {
        salarie_id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        poste: s.poste,
        statut: "absent" as const,
        heures_prevues: heures,
        motif: "CP en attente de validation",
        nature: "cp_attente",
      };
    }

    return {
      salarie_id: s.id,
      nom: s.nom,
      prenom: s.prenom,
      poste: s.poste,
      statut: "present" as const,
      heures_prevues: heures,
      motif: null,
      nature: null,
    };
  });

  const presents = lignes.filter((l) => l.statut === "present").length;
  const absents = lignes.filter((l) => l.statut === "absent").length;
  const repos = lignes.filter((l) => l.statut === "repos").length;

  return NextResponse.json({
    jour,
    totaux: { presents, absents, repos, total: lignes.length },
    lignes,
  });
}
