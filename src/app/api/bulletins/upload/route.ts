import { NextResponse } from "next/server";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";
import { uploaderFichier } from "@/lib/storage";
import { detecterSegments, extraireTextesPages } from "@/lib/pdf-bulletins";
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

  const contenu = Buffer.from(await fichier.arrayBuffer());
  console.info("[bulletins/upload] reçu", {
    name: fichier.name,
    type: fichier.type,
    size: contenu.length,
    magic: contenu.subarray(0, 8).toString("latin1"),
  });

  // Analyse du PDF (texte extractible requis : pas une photo/scan)
  let textesPages: string[];
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
    return NextResponse.json(
      {
        error:
          "Impossible de lire ce PDF. Réexportez-le depuis le logiciel de paie (PDF natif). Si le problème continue, déposez le fichier côté web pour confirmer.",
      },
      { status: 400 }
    );
  }
  if (textesPages.length === 0) {
    return NextResponse.json({ error: "PDF vide." }, { status: 400 });
  }

  const charsUtiles = textesPages.reduce((n, t) => n + t.trim().length, 0);
  if (charsUtiles < 20) {
    console.warn("[bulletins/upload] PDF sans couche texte:", {
      name: fichier.name,
      size: contenu.length,
      pages: textesPages.length,
      chars: charsUtiles,
    });
    return NextResponse.json(
      {
        error:
          "Ce PDF n'a pas de texte extractible (souvent un export « image » ou une impression PDF). Dans le logiciel de paie, exportez un PDF texte (le texte doit être sélectionnable dans Aperçu / Adobe). Une capture ou un scan ne fonctionne pas.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const salaries = await salariesAttendus(admin, dossierId, mois);
  const segments = detecterSegments(textesPages, salaries);

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
