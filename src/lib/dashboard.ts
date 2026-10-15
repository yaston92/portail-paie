import type { SupabaseClient } from "@supabase/supabase-js";
import { estPresentSurMois } from "@/lib/format";
import type { Campagne, Dossier, Profile, Salarie } from "@/lib/types";

export interface LigneDashboard {
  dossier: Dossier;
  collaborateurNom: string;
  campagne: Campagne | null;
  paiesAttendues: number;
  paiesEnvoyees: number;
  demande: boolean;
  recu: boolean;
  envoye: boolean;
  enRetard: boolean;
}

export interface TotauxDashboard {
  dossiers: { demandes: number; recus: number; envoyes: number; total: number };
  paies: { demandees: number; recues: number; envoyees: number };
}

export interface DonneesDashboard {
  lignes: LigneDashboard[];
  totaux: TotauxDashboard;
  collaborateurs: Pick<Profile, "id" | "nom" | "prenom">[];
}

/**
 * Tableau de bord mensuel du cabinet, 3 niveaux :
 * 1. variables demandées (campagne ouverte)
 * 2. variables reçues (campagne clôturée ou envoyée)
 * 3. paies envoyées (bulletins publiés)
 * Sur 2 axes : nombre de dossiers et nombre de paies.
 * Les requêtes passent par la RLS de l'appelant (admin : tout, collaborateur : portefeuille).
 */
export async function calculerDashboard(
  supabase: SupabaseClient,
  mois: string,
  collaborateurId?: string,
  cabinetId?: string
): Promise<DonneesDashboard> {
  let dossierQuery = supabase
    .from("dossiers")
    .select("id, sigle, raison_sociale, collaborateur_id, archive, cabinet_id")
    .eq("archive", false)
    .order("sigle");
  if (cabinetId) {
    dossierQuery = dossierQuery.eq("cabinet_id", cabinetId);
  }

  const [
    { data: dossiersData },
    { data: campagnesData },
    { data: collabs },
    { data: affectations, error: errAffectations },
    { data: salariesData },
    { data: bulletinsData },
  ] = await Promise.all([
    dossierQuery,
    cabinetId
      ? supabase
          .from("campagnes")
          .select(
            "id, dossier_id, mois, statut, date_limite, dossiers!inner(cabinet_id)"
          )
          .eq("mois", mois)
          .eq("dossiers.cabinet_id", cabinetId)
      : supabase
          .from("campagnes")
          .select("id, dossier_id, mois, statut, date_limite")
          .eq("mois", mois),
    cabinetId
      ? supabase
          .from("cabinet_membres")
          .select("profile:profiles (id, nom, prenom)")
          .eq("cabinet_id", cabinetId)
      : supabase
          .from("profiles")
          .select("id, nom, prenom")
          .in("role", ["directeur", "admin_cabinet", "collaborateur"])
          .order("nom"),
    cabinetId
      ? supabase
          .from("dossier_collaborateurs")
          .select("dossier_id, profile_id, dossiers!inner(cabinet_id)")
          .eq("dossiers.cabinet_id", cabinetId)
      : supabase.from("dossier_collaborateurs").select("dossier_id, profile_id"),
    cabinetId
      ? supabase
          .from("salaries")
          .select(
            "id, dossier_id, date_entree, date_sortie, dossiers!inner(cabinet_id, archive)"
          )
          .eq("dossiers.cabinet_id", cabinetId)
          .eq("dossiers.archive", false)
      : supabase
          .from("salaries")
          .select("id, dossier_id, date_entree, date_sortie"),
    cabinetId
      ? supabase
          .from("bulletins")
          .select("dossier_id, id, dossiers!inner(cabinet_id)")
          .eq("mois", mois)
          .eq("dossiers.cabinet_id", cabinetId)
      : supabase.from("bulletins").select("dossier_id, id").eq("mois", mois),
  ]);

  let dossiers = (dossiersData ?? []) as Dossier[];
  const liens = errAffectations
    ? []
    : ((affectations ?? []) as { dossier_id: string; profile_id: string }[]);
  if (collaborateurId) {
    if (errAffectations) {
      dossiers = dossiers.filter((d) => d.collaborateur_id === collaborateurId);
    } else {
      const ids = new Set(
        liens
          .filter((l) => l.profile_id === collaborateurId)
          .map((l) => l.dossier_id)
      );
      dossiers = dossiers.filter(
        (d) => d.collaborateur_id === collaborateurId || ids.has(d.id)
      );
    }
  }
  const dossierIds = dossiers.map((d) => d.id);
  const campagneParDossier = new Map(
    ((campagnesData ?? []) as unknown as Campagne[])
      .filter((c) => dossierIds.includes(c.dossier_id))
      .map((c) => [c.dossier_id, c])
  );

  let collaborateurs: Pick<Profile, "id" | "nom" | "prenom">[] = [];
  if (cabinetId) {
    for (const row of collabs ?? []) {
      const p = (row as { profile?: Pick<Profile, "id" | "nom" | "prenom"> | null })
        .profile;
      if (p) collaborateurs.push(p);
    }
    collaborateurs.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  } else {
    collaborateurs = (collabs ?? []) as Pick<Profile, "id" | "nom" | "prenom">[];
  }
  const nomCollab = new Map(
    collaborateurs.map((c) => [c.id, `${c.prenom} ${c.nom}`.trim()])
  );

  const idsRestants = new Set(dossierIds);
  const salariesParDossier = new Map<
    string,
    Pick<Salarie, "id" | "dossier_id" | "date_entree" | "date_sortie">[]
  >();
  for (const s of (salariesData ?? []) as Pick<
    Salarie,
    "id" | "dossier_id" | "date_entree" | "date_sortie"
  >[]) {
    if (!idsRestants.has(s.dossier_id)) continue;
    const liste = salariesParDossier.get(s.dossier_id) ?? [];
    liste.push(s);
    salariesParDossier.set(s.dossier_id, liste);
  }
  const bulletinsParDossier = new Map<string, number>();
  for (const b of (bulletinsData ?? []) as { dossier_id: string }[]) {
    if (!idsRestants.has(b.dossier_id)) continue;
    bulletinsParDossier.set(
      b.dossier_id,
      (bulletinsParDossier.get(b.dossier_id) ?? 0) + 1
    );
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const lignes: LigneDashboard[] = dossiers.map((dossier) => {
    const campagne = campagneParDossier.get(dossier.id) ?? null;
    const paiesAttendues = (salariesParDossier.get(dossier.id) ?? []).filter(
      (s) => estPresentSurMois(s, mois)
    ).length;
    const paiesEnvoyees = bulletinsParDossier.get(dossier.id) ?? 0;
    const demande = campagne !== null;
    const recu =
      campagne !== null &&
      (campagne.statut === "cloturee_identique" ||
        campagne.statut === "envoyee" ||
        campagne.statut === "bulletins_envoyes");
    const envoye =
      paiesEnvoyees > 0 || campagne?.statut === "bulletins_envoyes";
    return {
      dossier,
      collaborateurNom: nomsCollaborateurs(
        dossier,
        liens,
        nomCollab
      ),
      campagne,
      paiesAttendues,
      paiesEnvoyees,
      demande,
      recu,
      envoye,
      enRetard:
        campagne !== null &&
        campagne.statut === "ouverte" &&
        campagne.date_limite < aujourdhui,
    };
  });

  const totaux: TotauxDashboard = {
    dossiers: {
      demandes: lignes.filter((l) => l.demande).length,
      recus: lignes.filter((l) => l.recu).length,
      envoyes: lignes.filter((l) => l.envoye).length,
      total: lignes.length,
    },
    paies: {
      demandees: lignes
        .filter((l) => l.demande)
        .reduce((acc, l) => acc + l.paiesAttendues, 0),
      recues: lignes
        .filter((l) => l.recu)
        .reduce((acc, l) => acc + l.paiesAttendues, 0),
      envoyees: lignes.reduce((acc, l) => acc + l.paiesEnvoyees, 0),
    },
  };

  return { lignes, totaux, collaborateurs };
}

function nomsCollaborateurs(
  dossier: Dossier,
  liens: { dossier_id: string; profile_id: string }[],
  nomCollab: Map<string, string>
): string {
  const ids = liens
    .filter((l) => l.dossier_id === dossier.id)
    .map((l) => l.profile_id);
  if (ids.length === 0 && dossier.collaborateur_id) ids.push(dossier.collaborateur_id);
  const noms = [...new Set(ids)]
    .map((id) => nomCollab.get(id))
    .filter((n): n is string => !!n);
  return noms.length > 0 ? noms.join(", ") : "-";
}
