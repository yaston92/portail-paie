import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";
import { telechargerFichier } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Réversibilité RGPD (administrateur uniquement) :
 * export complet d'un dossier : données structurées en JSON + tous les
 * documents et bulletins : dans une archive ZIP.
 */
export async function GET(request: Request) {
  const profile = await getApiProfile(["admin_cabinet"]);
  if (!profile) {
    return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dossierId = searchParams.get("dossier");
  if (!dossierId) {
    return NextResponse.json({ error: "Paramètre dossier requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: dossier } = await admin
    .from("dossiers")
    .select("*")
    .eq("id", dossierId)
    .maybeSingle();
  if (!dossier) {
    return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  }

  const [salaries, embauches, campagnes, saisies, absences, notes, bulletins, documents, soldes, attestations] =
    await Promise.all([
      admin.from("salaries").select("*").eq("dossier_id", dossierId),
      admin.from("embauches").select("*").eq("dossier_id", dossierId),
      admin.from("campagnes").select("*").eq("dossier_id", dossierId),
      admin.from("saisies_variables").select("*").eq("dossier_id", dossierId),
      admin.from("absences").select("*").eq("dossier_id", dossierId),
      admin.from("notes").select("*").eq("dossier_id", dossierId),
      admin.from("bulletins").select("*").eq("dossier_id", dossierId),
      admin.from("salarie_documents").select("*").eq("dossier_id", dossierId),
      admin.from("soldes_cp").select("*").eq("dossier_id", dossierId),
      admin.from("dossier_attestations").select("*").eq("dossier_id", dossierId),
    ]);

  const zip = new JSZip();
  const donnees = zip.folder("donnees")!;
  donnees.file("dossier.json", JSON.stringify(dossier, null, 2));
  donnees.file("salaries.json", JSON.stringify(salaries.data ?? [], null, 2));
  donnees.file("embauches.json", JSON.stringify(embauches.data ?? [], null, 2));
  donnees.file("campagnes.json", JSON.stringify(campagnes.data ?? [], null, 2));
  donnees.file("saisies_variables.json", JSON.stringify(saisies.data ?? [], null, 2));
  donnees.file("absences.json", JSON.stringify(absences.data ?? [], null, 2));
  donnees.file("notes.json", JSON.stringify(notes.data ?? [], null, 2));
  donnees.file("soldes_cp.json", JSON.stringify(soldes.data ?? [], null, 2));
  donnees.file("attestations.json", JSON.stringify(attestations.data ?? [], null, 2));

  // Bulletins publiés
  const dossierBulletins = zip.folder("bulletins")!;
  for (const b of bulletins.data ?? []) {
    try {
      const contenu = await telechargerFichier("bulletins", b.chemin);
      dossierBulletins.file(b.nom_fichier, contenu);
    } catch {
      // fichier manquant : signalé dans le JSON
    }
  }

  const dossierAttestations = zip.folder("attestations")!;
  for (const a of attestations.data ?? []) {
    try {
      const contenu = await telechargerFichier("documents", a.chemin);
      dossierAttestations.file(`${a.type}-${a.nom_fichier}`, contenu);
    } catch {
      // fichier manquant
    }
  }

  // Documents salariés
  const dossierDocs = zip.folder("documents")!;
  for (const d of documents.data ?? []) {
    try {
      const contenu = await telechargerFichier("documents", d.chemin);
      dossierDocs.file(`${d.salarie_id}-${d.type_document}-${d.nom_fichier}`, contenu);
    } catch {
      // idem
    }
  }

  await journaliser({
    userId: profile.id,
    action: "export_reversibilite",
    cibleType: "dossier",
    cibleId: dossierId,
    dossierId,
  });

  const archive = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "Content-Disposition": `attachment; filename="export-${dossier.sigle}.zip"`,
      "Content-Type": "application/zip",
    },
  });
}
