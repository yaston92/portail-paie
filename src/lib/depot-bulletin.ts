import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyserBulletinDepose } from "@/lib/analyser-bulletins";
import { notifier } from "@/lib/notify";
import { telechargerFichier } from "@/lib/storage";

/** Au-delà, l'envoi direct vers le stockage est refusé. */
export const TAILLE_MAX_PDF = 40 * 1024 * 1024;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function identifiantDepot(valeur: string): boolean {
  return UUID.test(valeur);
}

export function cheminDepotBulletin(dossierId: string, uploadId: string): string {
  return `dossiers/${dossierId}/uploads/${uploadId}.pdf`;
}

const VERROU_MS = 3 * 60 * 1000;

/**
 * Relance un découpage resté sans pages. Un verrou de 3 minutes empêche
 * deux lectures du même PDF en parallèle.
 */
export async function reprendreDepot(
  admin: SupabaseClient,
  uploadId: string,
  contenu?: Buffer
): Promise<"fait" | "en_cours" | "absent"> {
  const { data: upload } = await admin
    .from("bulletin_uploads")
    .select("id, dossier_id, mois, created_by, chemin, nb_pages, published_at, statut")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload) return "absent";
  if (upload.nb_pages != null) return "fait";

  const verrou = upload.published_at ? new Date(upload.published_at).getTime() : 0;
  if (verrou && Date.now() - verrou < VERROU_MS) return "en_cours";

  const maintenant = new Date().toISOString();
  let prise = admin
    .from("bulletin_uploads")
    .update({ published_at: maintenant })
    .eq("id", uploadId)
    .is("nb_pages", null);
  prise = upload.published_at
    ? prise.eq("published_at", upload.published_at)
    : prise.is("published_at", null);
  const { data: pris } = await prise.select("id");
  if (!pris?.length) return "en_cours";

  const userId = (upload.created_by as string | null) ?? "";
  try {
    const pdf = contenu ?? (await telechargerFichier("bulletins", upload.chemin));
    await analyserBulletinDepose({
      admin,
      uploadId,
      dossierId: upload.dossier_id,
      mois: upload.mois,
      userId,
      contenu: pdf,
    });
    if (upload.statut !== "publie") {
      await admin
        .from("bulletin_uploads")
        .update({ published_at: null })
        .eq("id", uploadId)
        .neq("statut", "publie");
    }
    return "fait";
  } catch (e) {
    console.error("[bulletins/upload] découpage:", e);
    await admin
      .from("bulletin_uploads")
      .update({ nb_pages: 0, published_at: null })
      .eq("id", uploadId);
    if (userId) {
      await notifier({
        userIds: [userId],
        titre: "Découpage des bulletins impossible",
        corps: "Le PDF a été reçu, mais le découpage n'a pas abouti. Déposez-le à nouveau.",
        lien: "/cabinet/bulletins",
        email: false,
      });
    }
    return "fait";
  }
}

/** Le découpage continue après la réponse, puis une notification prévient. */
export function planifierDecoupage(opts: {
  admin: SupabaseClient;
  uploadId: string;
  contenu: Buffer;
}): void {
  const { admin, uploadId, contenu } = opts;
  after(async () => {
    await reprendreDepot(admin, uploadId, contenu);
  });
}
