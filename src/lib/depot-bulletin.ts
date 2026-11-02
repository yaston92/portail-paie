import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyserBulletinDepose } from "@/lib/analyser-bulletins";
import { notifier } from "@/lib/notify";

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

/** Le découpage continue après la réponse, puis une notification prévient. */
export function planifierDecoupage(opts: {
  admin: SupabaseClient;
  uploadId: string;
  dossierId: string;
  mois: string;
  userId: string;
  contenu: Buffer;
}): void {
  const { admin, uploadId, dossierId, mois, userId, contenu } = opts;
  after(async () => {
    try {
      await analyserBulletinDepose({
        admin,
        uploadId,
        dossierId,
        mois,
        userId,
        contenu,
      });
    } catch (e) {
      console.error("[bulletins/upload] découpage:", e);
      await admin.from("bulletin_uploads").update({ nb_pages: 0 }).eq("id", uploadId);
      await notifier({
        userIds: [userId],
        titre: "Découpage des bulletins impossible",
        corps: "Le PDF a été reçu, mais le découpage n'a pas abouti. Déposez-le à nouveau.",
        lien: "/cabinet/bulletins",
        email: false,
      });
    }
  });
}
