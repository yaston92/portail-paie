import { createAdminClient } from "@/lib/supabase/admin";
import { joursOuvres, moisDeJour } from "@/lib/demandes-conge";
import { heuresDuJour, normaliserHoraires } from "@/lib/horaires";
import type { ArretMaladie } from "@/lib/types";

/**
 * Injecte les jours d'arrêt maladie dans les saisies des campagnes
 * ouvertes / envoyées / clôturées. Retourne les jours sans campagne.
 */
export async function synchroniserAbsencesMaladie(opts: {
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
      .select("id, mode")
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
        .select("id, mode")
        .single();
      if (error || !created) {
        pending.push(...joursMois);
        continue;
      }
      saisie = created;
    } else if (!saisie.mode) {
      await admin
        .from("saisies_variables")
        .update({ mode: "variables", updated_at: new Date().toISOString() })
        .eq("id", saisie.id);
    }

    await Promise.all(
      joursMois.map((jour) =>
        admin.from("absences").upsert(
          {
            saisie_id: saisie.id,
            dossier_id: opts.dossierId,
            jour,
            nature: "maladie",
            heures: Math.max(heuresDuJour(horaires, jour, salarie?.duree_hebdo), 0.5),
          },
          { onConflict: "saisie_id,jour" }
        )
      )
    );
  }

  return pending;
}

/** Rejoue les arrêts maladie en attente sur une campagne nouvellement ouverte. */
export async function rejouerPendingSyncArretsMaladie(opts: {
  dossierId: string;
  mois: string;
}): Promise<number> {
  const admin = createAdminClient();
  const { data: arrets } = await admin
    .from("arrets_maladie")
    .select("*")
    .eq("dossier_id", opts.dossierId);

  let syncs = 0;
  for (const raw of arrets ?? []) {
    const a = raw as ArretMaladie;
    const pending = Array.isArray(a.pending_sync) ? a.pending_sync : [];
    const dansMois = new Set([
      ...joursOuvres(a.date_debut, a.date_fin).filter(
        (j) => moisDeJour(j) === opts.mois
      ),
      ...pending.filter((j) => moisDeJour(j) === opts.mois),
    ]);
    if (dansMois.size === 0) continue;

    const aSync = [...dansMois];
    const restants = await synchroniserAbsencesMaladie({
      salarieId: a.salarie_id,
      dossierId: a.dossier_id,
      jours: aSync,
    });
    const syncOk = aSync.filter((j) => !restants.includes(j));
    syncs += syncOk.length;

    const encore = [
      ...pending.filter((j) => moisDeJour(j) !== opts.mois),
      ...restants,
    ];
    await admin
      .from("arrets_maladie")
      .update({ pending_sync: [...new Set(encore)] })
      .eq("id", a.id);
  }
  return syncs;
}
