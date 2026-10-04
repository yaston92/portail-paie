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
  if (collaborateurId) {
    dossierQuery = dossierQuery.eq("collaborateur_id", collaborateurId);
  }

  const [{ data: dossiersData }, { data: campagnesData }, { data: collabs }] =
    await Promise.all([
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
    ]);

  const dossiers = (dossiersData ?? []) as Dossier[];
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

  // Salariés (pour compter les paies attendues) et bulletins publiés du mois
  const [{ data: salariesData }, { data: bulletinsData }] = await Promise.all([
    dossierIds.length
      ? supabase
          .from("salaries")
          .select("id, dossier_id, date_entree, date_sortie")
          .in("dossier_id", dossierIds)
      : Promise.resolve({ data: [] }),
    dossierIds.length
      ? supabase
          .from("bulletins")
          .select("dossier_id, id")
          .eq("mois", mois)
          .in("dossier_id", dossierIds)
      : Promise.resolve({ data: [] }),
  ]);

  const salariesParDossier = new Map<
    string,
    Pick<Salarie, "id" | "dossier_id" | "date_entree" | "date_sortie">[]
  >();
  for (const s of (salariesData ?? []) as Pick<
    Salarie,
    "id" | "dossier_id" | "date_entree" | "date_sortie"
  >[]) {
    const liste = salariesParDossier.get(s.dossier_id) ?? [];
    liste.push(s);
    salariesParDossier.set(s.dossier_id, liste);
  }
  const bulletinsParDossier = new Map<string, number>();
  for (const b of (bulletinsData ?? []) as { dossier_id: string }[]) {
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
      collaborateurNom: dossier.collaborateur_id
        ? (nomCollab.get(dossier.collaborateur_id) ?? "-")
        : "-",
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
