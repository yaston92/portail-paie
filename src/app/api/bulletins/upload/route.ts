import { NextResponse } from "next/server";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { refuserSansDroit } from "@/lib/droits-serveur";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";
import { dechiffrer } from "@/lib/crypto";
import { uploaderFichier } from "@/lib/storage";
import {
  compterPagesPdf,
  detecterSegments,
  estPdfValide,
  extraireTextesPages,
  normaliserPdf,
  segmentsUnePageChacun,
} from "@/lib/pdf-bulletins";
import { salariesAttendus } from "@/lib/campagne";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Upload du PDF global des paies d'un dossier (cabinet).
 * Analyse immédiate : découpage en segments par salarié (frontières variables)
 * et extraction heuristique des soldes de CP, en vue de l'écran de contrôle.
 */
export async function POST(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const refus = await refuserSansDroit(profile, "bulletins");
  if (refus) return refus;

  const form = await request.formData();
  const dossierId = (form.get("dossier_id") as string) ?? "";
  const mois = (form.get("mois") as string) ?? "";
  const fichier = form.get("fichier");

  if (!dossierId || !/^\d{4}-\d{2}-01$/.test(mois) || !(fichier instanceof File)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  if (!fichier.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Fichier PDF attendu." }, { status: 400 });
  }
  if (!(await cabinetPeutAccederDossier(dossierId))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  const brut = Buffer.from(await fichier.arrayBuffer());
  const contenu = normaliserPdf(brut);
  if (!estPdfValide(contenu)) {
    return NextResponse.json(
      {
        error:
          "Ce fichier n'est pas un PDF valide. Réexportez-le depuis le logiciel de paie, sans le passer par un aperçu ou une photo.",
      },
      { status: 400 }
    );
  }
  console.info("[bulletins/upload] reçu", {
    name: fichier.name,
    type: fichier.type,
    size: contenu.length,
    magic: contenu.subarray(0, 8).toString("latin1"),
  });

  // Analyse du PDF. Le nombre de pages vient du fichier, pas du texte lu.
  let textesPages: string[];
  let nbPages: number;
  try {
    nbPages = await compterPagesPdf(contenu);
  } catch {
    return NextResponse.json({ error: "PDF vide ou illisible." }, { status: 400 });
  }
  try {
    textesPages = await extraireTextesPages(contenu);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_A_PDF") {
      return NextResponse.json(
        {
          error:
            "Ce fichier n'est pas un PDF valide (ou a été tronqué à l'envoi). Réessayez avec le .pdf exporté du logiciel de paie.",
        },
        { status: 400 }
      );
    }
    console.error("[bulletins/upload] lecture PDF impossible:", {
      name: fichier.name,
      size: contenu.length,
      error: e,
    });
    textesPages = [];
  }
  while (textesPages.length < nbPages) textesPages.push("");
  if (textesPages.length > nbPages) textesPages = textesPages.slice(0, nbPages);
  if (nbPages === 0) {
    return NextResponse.json({ error: "PDF vide." }, { status: 400 });
  }

  const admin = createAdminClient();
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

  // Stockage du PDF global
  const { data: upload, error } = await admin
    .from("bulletin_uploads")
    .insert({
      dossier_id: dossierId,
      mois,
      chemin: "",
      nb_pages: textesPages.length,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !upload) {
    return NextResponse.json({ error: "Échec de l'enregistrement." }, { status: 500 });
  }

  const chemin = `dossiers/${dossierId}/uploads/${upload.id}.pdf`;
  await uploaderFichier("bulletins", chemin, contenu, "application/pdf");
  await admin.from("bulletin_uploads").update({ chemin }).eq("id", upload.id);

  await admin.from("bulletin_segments").insert(
    segments.map((s) => ({
      upload_id: upload.id,
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

  await journaliser({
    userId: profile.id,
    action: "upload_pdf_bulletins",
    cibleType: "bulletin_upload",
    cibleId: upload.id,
    dossierId,
    details: {
      pages: textesPages.length,
      segments: segments.length,
      non_apparies: segments.filter((s) => !s.salarieId).length,
    },
  });

  return NextResponse.json({ ok: true, id: upload.id });
}
