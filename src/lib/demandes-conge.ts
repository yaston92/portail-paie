import { createAdminClient } from "@/lib/supabase/admin";
import { heuresDuJour, normaliserHoraires } from "@/lib/horaires";
import type { DemandeConge, SoldeCp } from "@/lib/types";

/** Date du jour (Europe/Paris) au format AAAA-MM-JJ. */
export function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Jours ouvrés (lun–ven) inclusifs entre deux dates ISO YYYY-MM-DD. */
export function joursOuvres(dateDebut: string, dateFin: string): string[] {
  const jours: string[] = [];
  const [y0, m0, d0] = dateDebut.split("-").map(Number);
  const [y1, m1, d1] = dateFin.split("-").map(Number);
  const cur = new Date(y0, m0 - 1, d0);
  const fin = new Date(y1, m1 - 1, d1);
  while (cur <= fin) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      jours.push(`${y}-${m}-${d}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return jours;
}

export function moisDeJour(jour: string): string {
  return `${jour.slice(0, 7)}-01`;
}

/** Solde N-1 / N dérivés pour l’affichage type MySilae. */
export function soldesDerives(cp: SoldeCp) {
  const hasDetail =
    cp.acquis_n1 != null ||
    cp.acquis_n != null ||
    cp.pris_n1 != null ||
    cp.pris_n != null;

  const acquisN1 = cp.acquis_n1 ?? null;
  const acquisN = cp.acquis_n ?? null;
  const prisN1 = cp.pris_n1 ?? null;
  const prisN = cp.pris_n ?? null;

  const soldeN1 =
    acquisN1 != null && prisN1 != null
      ? Math.round((acquisN1 - prisN1) * 100) / 100
      : null;
  const soldeN =
    acquisN != null && prisN != null
      ? Math.round((acquisN - prisN) * 100) / 100
      : null;

  const acquisTotal =
    cp.acquis ??
    (acquisN1 != null && acquisN != null
      ? Math.round((acquisN1 + acquisN) * 100) / 100
      : acquisN1 ?? acquisN);
  const prisTotal =
    cp.pris ??
    (prisN1 != null && prisN != null
      ? Math.round((prisN1 + prisN) * 100) / 100
      : prisN1 ?? prisN);
  const restant =
    cp.restant ??
    (soldeN1 != null && soldeN != null
      ? Math.round((soldeN1 + soldeN) * 100) / 100
      : soldeN1 ?? soldeN);

  return {
    hasDetail,
    acquisN1,
    acquisN,
    prisN1,
    prisN,
    soldeN1,
    soldeN,
    acquisTotal,
    prisTotal,
    restant,
  };
}

/**
 * Jours à déduire du solde bulletin pour le prévisionnel :
 * demandes en attente + validées dont la fin est après le mois de référence.
 */
export function joursADeduirePrevisionnel(
  demandes: Pick<DemandeConge, "statut" | "jours" | "date_fin">[],
  moisReference: string | null
): number {
  let total = 0;
  for (const d of demandes) {
    if (d.statut !== "en_attente" && d.statut !== "validee") continue;
    if (moisReference && d.date_fin <= moisReference.slice(0, 10)) {
      // Congés entièrement dans/avant le mois du bulletin : déjà reflétés en principe
      // On déduit seulement si en_attente (pas encore sur bulletin) ou validée après référence
      if (d.statut === "validee") continue;
    }
    total += Number(d.jours) || 0;
  }
  return Math.round(total * 100) / 100;
}

export function soldePrevisionnel(
  restant: number | null,
  demandes: Pick<DemandeConge, "statut" | "jours" | "date_fin">[],
  moisReference: string | null
): number | null {
  if (restant == null) return null;
  const deduit = joursADeduirePrevisionnel(demandes, moisReference);
  return Math.round((restant - deduit) * 100) / 100;
}

/**
 * Écrit les absences CP sur les saisies des campagnes ouvertes/envoyées.
 * Retourne les jours non synchronisés (pas de campagne).
 */
export async function synchroniserAbsencesDepuisDemande(opts: {
  salarieId: string;
  dossierId: string;
  jours: string[];
}): Promise<string[]> {
  const admin = createAdminClient();
  const { data: salarie } = await admin
    .from("salaries")
    .select("duree_hebdo, horaires")
    .eq("id", opts.salarieId)
    .maybeSingle();

  const horaires = normaliserHoraires(salarie?.horaires, salarie?.duree_hebdo);

  const parMois = new Map<string, string[]>();
  for (const jour of opts.jours) {
    const mois = moisDeJour(jour);
    const liste = parMois.get(mois) ?? [];
    liste.push(jour);
    parMois.set(mois, liste);
  }

  const pending: string[] = [];

  for (const [mois, joursMois] of parMois) {
    const { data: campagne } = await admin
      .from("campagnes")
      .select("id, statut")
      .eq("dossier_id", opts.dossierId)
      .eq("mois", mois)
      .in("statut", [
        "ouverte",
        "envoyee",
        "cloturee_identique",
        "bulletins_envoyes",
      ])
      .maybeSingle();

    if (!campagne) {
      pending.push(...joursMois);
      continue;
    }

    let { data: saisie } = await admin
      .from("saisies_variables")
      .select("id")
      .eq("campagne_id", campagne.id)
      .eq("salarie_id", opts.salarieId)
      .maybeSingle();

    if (!saisie) {
      const { data: created, error } = await admin
        .from("saisies_variables")
        .insert({
          campagne_id: campagne.id,
          salarie_id: opts.salarieId,
          dossier_id: opts.dossierId,
          mode: "variables",
        })
        .select("id")
        .single();
      if (error || !created) {
        pending.push(...joursMois);
        continue;
      }
      saisie = created;
    }

    await Promise.all(
      joursMois.map((jour) =>
        admin.from("absences").upsert(
          {
            saisie_id: saisie.id,
            dossier_id: opts.dossierId,
            jour,
            nature: "cp",
            heures: Math.max(heuresDuJour(horaires, jour, salarie?.duree_hebdo), 0.5),
          },
          { onConflict: "saisie_id,jour" }
        )
      )
    );
  }

  return pending;
}

/** Injecte les CP validés d’un dossier dans la campagne du mois (absences variables). */
export async function rejouerPendingSyncCampagne(opts: {
  dossierId: string;
  mois: string;
}): Promise<number> {
  const admin = createAdminClient();
  const { data: demandes } = await admin
    .from("demandes_conge")
    .select("*")
    .eq("dossier_id", opts.dossierId)
    .eq("statut", "validee");

  let syncs = 0;
  for (const raw of demandes ?? []) {
    const d = raw as DemandeConge;
    const pending = Array.isArray(d.pending_sync) ? d.pending_sync : [];
    // Tous les jours ouvrés de la demande qui tombent sur le mois de la campagne
    const dansMois = new Set([
      ...joursOuvres(d.date_debut, d.date_fin).filter(
        (j) => moisDeJour(j) === opts.mois
      ),
      ...pending.filter((j) => moisDeJour(j) === opts.mois),
    ]);
    if (dansMois.size === 0) continue;

    const aSync = [...dansMois];
    const restants = await synchroniserAbsencesDepuisDemande({
      salarieId: d.salarie_id,
      dossierId: d.dossier_id,
      jours: aSync,
    });
    const syncOk = aSync.filter((j) => !restants.includes(j));
    syncs += syncOk.length;

    // Retire du pending les jours désormais écrits (ou hors mois restants)
    const encore = [
      ...pending.filter((j) => moisDeJour(j) !== opts.mois),
      ...restants,
    ];
    const unique = [...new Set(encore)];
    await admin
      .from("demandes_conge")
      .update({
        pending_sync: unique,
        updated_at: new Date().toISOString(),
      })
      .eq("id", d.id);
  }
  return syncs;
}
