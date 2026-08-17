import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";
import { destinatairesClientsParDossier, notifier } from "@/lib/notify";
import { formatDate, moisLabel } from "@/lib/format";
import { rejouerPendingSyncCampagne } from "@/lib/demandes-conge";
import { rejouerPendingSyncArretsMaladie } from "@/lib/arrets-maladie";

export type OuvrirCampagnesResultat = {
  ouvertes: number;
  deja: number;
};

/**
 * Ouvre les campagnes manquantes pour les dossiers demandés (ou tous les
 * dossiers non archivés). Idempotent : les dossiers déjà couverts sont ignorés.
 */
export async function ouvrirCampagnesManquantes(opts: {
  mois: string;
  dateLimite: string;
  dossierIds?: string[];
  userId: string | null;
  action?: string;
}): Promise<OuvrirCampagnesResultat> {
  const { mois, dateLimite, dossierIds, userId } = opts;
  const action = opts.action ?? "ouverture_campagnes";
  const admin = createAdminClient();

  let dossiersQuery = admin
    .from("dossiers")
    .select("id, sigle")
    .eq("archive", false);
  if (dossierIds?.length) {
    dossiersQuery = dossiersQuery.in("id", dossierIds);
  }
  const { data: dossiers } = await dossiersQuery;
  if (!dossiers?.length) {
    return { ouvertes: 0, deja: 0 };
  }

  const { data: existantes } = await admin
    .from("campagnes")
    .select("dossier_id")
    .eq("mois", mois)
    .in(
      "dossier_id",
      dossiers.map((d) => d.id)
    );
  const dejaOuverts = new Set((existantes ?? []).map((c) => c.dossier_id));
  const aOuvrir = dossiers.filter((d) => !dejaOuverts.has(d.id));

  if (aOuvrir.length === 0) {
    return { ouvertes: 0, deja: dejaOuverts.size };
  }

  const { data: creees, error } = await admin
    .from("campagnes")
    .insert(
      aOuvrir.map((d) => ({
        dossier_id: d.id,
        mois,
        date_limite: dateLimite,
      }))
    )
    .select("id, dossier_id");

  if (error || !creees?.length) {
    throw new Error(error?.message || "Échec de l'ouverture des campagnes.");
  }

  const clientsParDossier = await destinatairesClientsParDossier(
    creees.map((c) => c.dossier_id)
  );
  const titre = `Variables de paie : ${moisLabel(mois)}`;
  const corps = `La campagne de ${moisLabel(mois)} est ouverte. Merci de nous transmettre vos variables avant le ${formatDate(dateLimite)}.`;

  const lot = 8;
  for (let i = 0; i < creees.length; i += lot) {
    const slice = creees.slice(i, i + lot);
    await Promise.all(
      slice.map(async (campagne) => {
        await Promise.all([
          notifier({
            userIds: clientsParDossier.get(campagne.dossier_id) ?? [],
            titre,
            corps,
            lien: `/client/variables/${campagne.id}`,
          }),
          rejouerPendingSyncCampagne({
            dossierId: campagne.dossier_id,
            mois,
          }),
          rejouerPendingSyncArretsMaladie({
            dossierId: campagne.dossier_id,
            mois,
          }),
        ]);
      })
    );
  }

  await journaliser({
    userId,
    action,
    details: {
      mois,
      date_limite: dateLimite,
      ouvertes: creees.length,
    },
  });

  return { ouvertes: creees.length, deja: dejaOuverts.size };
}

/** Date limite auto : le 15 du mois suivant (mois au format YYYY-MM-01). */
export function dateLimiteRetourCampagne(mois: string): string {
  const d = new Date(`${mois}T00:00:00`);
  d.setMonth(d.getMonth() + 1);
  d.setDate(15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-15`;
}
