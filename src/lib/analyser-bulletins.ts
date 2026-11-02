import type { SupabaseClient } from "@supabase/supabase-js";
import { journaliser } from "@/lib/audit";
import { salariesAttendus } from "@/lib/campagne";
import { dechiffrer } from "@/lib/crypto";
import { notifier } from "@/lib/notify";
import {
  compterPagesPdf,
  detecterSegments,
  extraireTextesPages,
  segmentsUnePageChacun,
} from "@/lib/pdf-bulletins";

/** Découpe un PDF déjà stocké et prévient la personne qui l'a déposé. */
export async function analyserBulletinDepose(opts: {
  admin: SupabaseClient;
  uploadId: string;
  dossierId: string;
  mois: string;
  userId: string;
  contenu: Buffer;
}): Promise<void> {
  const { admin, uploadId, dossierId, mois, userId, contenu } = opts;
  const { count: deja } = await admin
    .from("bulletin_segments")
    .select("id", { count: "exact", head: true })
    .eq("upload_id", uploadId);
  if ((deja ?? 0) > 0) {
    const { data: row } = await admin
      .from("bulletin_uploads")
      .select("nb_pages")
      .eq("id", uploadId)
      .maybeSingle();
    if (row?.nb_pages == null) {
      const pages = await compterPagesPdf(contenu);
      await admin.from("bulletin_uploads").update({ nb_pages: pages }).eq("id", uploadId);
    }
    return;
  }

  const nbPages = await compterPagesPdf(contenu);
  let textesPages: string[] = [];
  try {
    textesPages = await extraireTextesPages(contenu);
  } catch (e) {
    console.error("[bulletins/upload] lecture PDF impossible:", e);
  }
  while (textesPages.length < nbPages) textesPages.push("");
  if (textesPages.length > nbPages) textesPages = textesPages.slice(0, nbPages);

  const salaries = await salariesAttendus(admin, dossierId, mois);
  const ids = salaries.map((s) => s.id);
  const { data: sensibles } =
    ids.length > 0
      ? await admin
          .from("salaries_sensibles")
          .select("salarie_id, nir_chiffre")
          .in("salarie_id", ids)
      : { data: [] as { salarie_id: string; nir_chiffre: string }[] };
  const nirParId = new Map<string, string>();
  for (const row of sensibles ?? []) {
    try {
      nirParId.set(row.salarie_id, dechiffrer(row.nir_chiffre));
    } catch {
      /* NIR illisible : l'appariement se fera par matricule ou nom */
    }
  }
  const pourApparier = salaries.map((s) => ({
    id: s.id,
    nom: s.nom,
    prenom: s.prenom,
    matricule: s.matricule,
    nir: nirParId.get(s.id) ?? null,
  }));
  const texteVide = textesPages.every((t) => !t.trim());
  const segments =
    texteVide && nbPages > 1
      ? segmentsUnePageChacun(nbPages)
      : detecterSegments(textesPages, pourApparier);

  if (segments.length > 0) {
    const { error } = await admin.from("bulletin_segments").insert(
      segments.map((s) => ({
        upload_id: uploadId,
        page_debut: s.pageDebut,
        page_fin: s.pageFin,
        salarie_id: s.salarieId,
        cp_acquis: s.cpAcquis,
        cp_pris: s.cpPris,
        cp_restant: s.cpRestant,
        cp_acquis_n1: s.cpAcquisN1,
        cp_acquis_n: s.cpAcquisN,
        cp_pris_n1: s.cpPrisN1,
        cp_pris_n: s.cpPrisN,
        texte_apercu: s.texteApercu,
      }))
    );
    if (error) throw new Error(error.message);
  }

  await admin.from("bulletin_uploads").update({ nb_pages: nbPages }).eq("id", uploadId);

  await journaliser({
    userId,
    action: "upload_pdf_bulletins",
    cibleType: "bulletin_upload",
    cibleId: uploadId,
    dossierId,
    details: {
      pages: nbPages,
      segments: segments.length,
      non_apparies: segments.filter((s) => !s.salarieId).length,
    },
  });

  const nonApparies = segments.filter((s) => !s.salarieId).length;
  await notifier({
    userIds: [userId],
    titre: texteVide
      ? "PDF reçu, noms illisibles"
      : "Découpage des bulletins terminé",
    corps: texteVide
      ? "Les lettres de ce PDF sont dessinées : les noms ne peuvent pas être lus. Réexportez les bulletins depuis le logiciel de paie, avec le texte sélectionnable."
      : nonApparies > 0
        ? `${segments.length} bulletin(s) détecté(s), ${nonApparies} à affecter.`
        : `${segments.length} bulletin(s) détecté(s). Vous pouvez contrôler puis publier.`,
    lien: `/cabinet/bulletins/uploads/${uploadId}`,
    email: false,
  });
}
