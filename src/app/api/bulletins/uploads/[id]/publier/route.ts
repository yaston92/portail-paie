import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { refuserSansDroit } from "@/lib/droits-serveur";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { journaliser } from "@/lib/audit";
import { destinatairesClient, notifier } from "@/lib/notify";
import { telechargerFichier, uploaderFichier } from "@/lib/storage";
import { extrairePages, extraireSoldeCp, extraireTextesPages } from "@/lib/pdf-bulletins";
import { moisLabel, nomFichierBulletin } from "@/lib/format";
import type { BulletinSegment, BulletinUpload, Salarie } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Publication des bulletins après contrôle de l'appariement :
 * - refuse si des segments ne sont pas appariés à un salarié
 * - découpe le PDF global en un fichier par salarié
 * - renomme au format « SIGLE - NOM Prénom MM.AAAA.pdf »
 * - met à jour les soldes de CP extraits
 * - notifie le client et chaque salarié disposant d'un compte
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const refus = await refuserSansDroit(profile, "bulletins");
  if (refus) return refus;
  const { id } = await params;

  const supabase = await createClient();
  const { data: uploadData } = await supabase
    .from("bulletin_uploads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!uploadData) {
    return NextResponse.json({ error: "Upload inaccessible" }, { status: 403 });
  }
  const upload = uploadData as BulletinUpload;
  if (upload.statut === "publie") {
    return NextResponse.json({ error: "Déjà publié." }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: segmentsData }, { data: dossier }] = await Promise.all([
    admin
      .from("bulletin_segments")
      .select("*")
      .eq("upload_id", id)
      .order("page_debut"),
    admin
      .from("dossiers")
      .select("sigle, raison_sociale")
      .eq("id", upload.dossier_id)
      .single(),
  ]);
  const segments = (segmentsData ?? []) as BulletinSegment[];

  if (segments.length === 0) {
    return NextResponse.json({ error: "Aucun segment à publier." }, { status: 400 });
  }
  const nonApparies = segments.filter((s) => !s.salarie_id);
  if (nonApparies.length > 0) {
    return NextResponse.json(
      {
        error: `Publication impossible : ${nonApparies.length} segment(s) non apparié(s). Corrigez l'appariement sur l'écran de contrôle.`,
      },
      { status: 400 }
    );
  }

  const { data: salariesData } = await admin
    .from("salaries")
    .select("*")
    .in(
      "id",
      segments.map((s) => s.salarie_id!)
    );
  const salarieParId = new Map(
    ((salariesData ?? []) as Salarie[]).map((s) => [s.id, s])
  );

  const source = await telechargerFichier("bulletins", upload.chemin);
  const salariesNotifiables: {
    userId: string;
    bulletinId: string;
    prenom: string;
  }[] = [];

  async function publierSegment(segment: BulletinSegment) {
    const salarie = salarieParId.get(segment.salarie_id!);
    if (!salarie) return;

    const pdf = await extrairePages(source, segment.page_debut, segment.page_fin);
    const nomFichier = nomFichierBulletin(
      dossier?.sigle ?? "",
      salarie.nom,
      salarie.prenom,
      upload.mois
    );
    const chemin = `dossiers/${upload.dossier_id}/${upload.mois}/${salarie.id}.pdf`;
    await uploaderFichier("bulletins", chemin, pdf, "application/pdf");

    const { data: ligne } = await admin
      .from("bulletins")
      .upsert(
        {
          dossier_id: upload.dossier_id,
          salarie_id: salarie.id,
          mois: upload.mois,
          chemin,
          nom_fichier: nomFichier,
          upload_id: id,
          published_at: new Date().toISOString(),
        },
        { onConflict: "salarie_id,mois" }
      )
      .select("id")
      .single();

    // Solde CP : valeurs contrôlées sur le segment, sinon ré-extraction sur le PDF découpé
    let cpAcquis = segment.cp_acquis;
    let cpPris = segment.cp_pris;
    let cpRestant = segment.cp_restant;
    let cpAcquisN1 = segment.cp_acquis_n1 ?? null;
    let cpAcquisN = segment.cp_acquis_n ?? null;
    let cpPrisN1 = segment.cp_pris_n1 ?? null;
    let cpPrisN = segment.cp_pris_n ?? null;
    if (cpAcquis === null && cpPris === null && cpRestant === null) {
      try {
        const textes = await extraireTextesPages(Buffer.from(pdf));
        const cp = extraireSoldeCp(textes.join("\n"));
        cpAcquis = cp.acquis;
        cpPris = cp.pris;
        cpRestant = cp.restant;
        cpAcquisN1 = cp.acquis_n1;
        cpAcquisN = cp.acquis_n;
        cpPrisN1 = cp.pris_n1;
        cpPrisN = cp.pris_n;
      } catch (e) {
        console.error("[publier] extraction CP:", e);
      }
    }

    const aDesCp =
      cpAcquis !== null ||
      cpPris !== null ||
      cpRestant !== null ||
      cpAcquisN1 !== null ||
      cpAcquisN !== null ||
      cpPrisN1 !== null ||
      cpPrisN !== null;
    if (aDesCp) {
      const restant =
        cpRestant ??
        (cpAcquis !== null && cpPris !== null
          ? Math.round((cpAcquis - cpPris) * 100) / 100
          : null);
      await admin.from("soldes_cp").upsert(
        {
          salarie_id: salarie.id,
          dossier_id: upload.dossier_id,
          acquis: cpAcquis,
          pris: cpPris,
          restant,
          acquis_n1: cpAcquisN1,
          acquis_n: cpAcquisN,
          pris_n1: cpPrisN1,
          pris_n: cpPrisN,
          source: "extraction",
          mois_reference: upload.mois,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "salarie_id" }
      );
    }

    // Notification du salarié (sauf opposition au bulletin dématérialisé)
    if (ligne && salarie.profile_id && !salarie.opposition_bulletin) {
      salariesNotifiables.push({
        userId: salarie.profile_id,
        bulletinId: ligne.id,
        prenom: salarie.prenom?.trim() || "",
      });
    }
  }

  const lot = 4;
  for (let i = 0; i < segments.length; i += lot) {
    await Promise.all(segments.slice(i, i + lot).map((segment) => publierSegment(segment)));
  }

  await admin
    .from("bulletin_uploads")
    .update({ statut: "publie", published_at: new Date().toISOString() })
    .eq("id", id);

  // Campagne du même mois → statut « publié »
  await admin
    .from("campagnes")
    .update({
      statut: "bulletins_envoyes",
      traitee_at: new Date().toISOString(),
    })
    .eq("dossier_id", upload.dossier_id)
    .eq("mois", upload.mois)
    .in("statut", ["ouverte", "envoyee", "cloturee_identique", "bulletins_envoyes"]);

  await journaliser({
    userId: profile.id,
    action: "publication_bulletins",
    cibleType: "bulletin_upload",
    cibleId: id,
    dossierId: upload.dossier_id,
    details: { bulletins: segments.length, mois: upload.mois },
  });

  const libelleMois = moisLabel(upload.mois);
  await notifier({
    userIds: await destinatairesClient(upload.dossier_id),
    titre: `Les bulletins de paie de ${libelleMois} sont arrivés`,
    corps:
      `Les bulletins de paie de ${libelleMois} sont arrivés : ${segments.length} bulletin(s). ` +
      "Ouvrez votre espace pour les consulter. Vous pouvez aussi les enregistrer.",
    lien: "/client/bulletins",
    libelleLien: "Voir les bulletins",
  });
  for (const salarie of salariesNotifiables) {
    const corps = salarie.prenom
      ? `Bonjour ${salarie.prenom}, votre bulletin de paie de ${libelleMois} est arrivé. Ouvrez-le pour le consulter à l'écran. Vous pouvez aussi l'enregistrer si vous voulez le garder.`
      : `Votre bulletin de paie de ${libelleMois} est arrivé. Ouvrez-le pour le consulter à l'écran. Vous pouvez aussi l'enregistrer si vous voulez le garder.`;
    await notifier({
      userIds: [salarie.userId],
      titre: `Votre bulletin de paie de ${libelleMois} est arrivé`,
      corps,
      lien: `/voir-bulletin/${salarie.bulletinId}`,
      libelleLien: "Voir mon bulletin",
    });
  }

  return NextResponse.json({ ok: true, publies: segments.length });
}
