import { NextResponse } from "next/server";
import { cabinetPeutAccederDossier, getApiProfile } from "@/lib/auth";
import {
  TAILLE_MAX_PDF,
  cheminDepotBulletin,
  identifiantDepot,
  planifierDecoupage,
} from "@/lib/depot-bulletin";
import { refuserSansDroit } from "@/lib/droits-serveur";
import { estPdfValide, normaliserPdf } from "@/lib/pdf-bulletins";
import { supprimerFichiers, telechargerFichier, uploaderFichier } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Enregistre un PDF déjà déposé dans le stockage et lance le découpage. */
export async function POST(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const refus = await refuserSansDroit(profile, "bulletins");
  if (refus) return refus;

  const corps = (await request.json().catch(() => null)) as {
    id?: string;
    dossier_id?: string;
    mois?: string;
  } | null;
  const id = corps?.id ?? "";
  const dossierId = corps?.dossier_id ?? "";
  const mois = corps?.mois ?? "";
  if (
    !identifiantDepot(id) ||
    !identifiantDepot(dossierId) ||
    !/^\d{4}-\d{2}-01$/.test(mois)
  ) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  if (!(await cabinetPeutAccederDossier(dossierId))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: existant } = await admin
    .from("bulletin_uploads")
    .select("id, dossier_id, nb_pages")
    .eq("id", id)
    .maybeSingle();
  if (existant) {
    if (existant.dossier_id !== dossierId) {
      return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
    }
    return NextResponse.json({
      ok: true,
      id,
      en_cours: existant.nb_pages == null,
    });
  }

  const chemin = cheminDepotBulletin(dossierId, id);
  let contenu: Buffer;
  try {
    contenu = normaliserPdf(await telechargerFichier("bulletins", chemin));
  } catch {
    return NextResponse.json(
      { error: "Le PDF n'est pas arrivé. Déposez-le à nouveau." },
      { status: 400 }
    );
  }
  if (contenu.length > TAILLE_MAX_PDF || !estPdfValide(contenu)) {
    await supprimerFichiers("bulletins", [chemin]);
    return NextResponse.json(
      {
        error: estPdfValide(contenu)
          ? "Ce PDF dépasse 40 Mo. Réexportez-le depuis le logiciel de paie."
          : "Ce fichier n'est pas un PDF valide. Réexportez-le depuis le logiciel de paie, sans le passer par un aperçu ou une photo.",
      },
      { status: 400 }
    );
  }

  const { error } = await admin.from("bulletin_uploads").insert({
    id,
    dossier_id: dossierId,
    mois,
    chemin,
    nb_pages: null,
    created_by: profile.id,
  });
  if (error) {
    await supprimerFichiers("bulletins", [chemin]);
    return NextResponse.json({ error: "Échec de l'enregistrement." }, { status: 500 });
  }

  if (contenu.byteOffset !== 0 || contenu.length !== contenu.buffer.byteLength) {
    await uploaderFichier("bulletins", chemin, contenu, "application/pdf");
  }

  planifierDecoupage({
    admin,
    uploadId: id,
    dossierId,
    mois,
    userId: profile.id,
    contenu,
  });

  return NextResponse.json({ ok: true, id, en_cours: true });
}
