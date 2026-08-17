import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { destinatairesCabinet, destinatairesClient, notifier } from "@/lib/notify";
import {
  contentTypePourExtension,
  extensionFichier,
  uploaderFichier,
} from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Ajout d'une note (zone libre) par le client ou le cabinet,
 * rattachée à une campagne et/ou un salarié, avec pièce jointe facultative.
 */
export async function POST(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur", "client"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const form = await request.formData();
  const dossierId = (form.get("dossier_id") as string) ?? "";
  const campagneId = (form.get("campagne_id") as string) || null;
  const salarieId = (form.get("salarie_id") as string) || null;
  const contenu = ((form.get("contenu") as string) ?? "").trim();
  const piece = form.get("piece");
  const fichier = piece instanceof File && piece.size > 0 ? piece : null;

  if (!dossierId || (!contenu && !fichier)) {
    return NextResponse.json(
      { error: "Écrivez un message ou joignez une pièce." },
      { status: 400 }
    );
  }

  // Contrôle d'accès au dossier
  if (profile.role === "client") {
    if (profile.dossier_id !== dossierId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
  } else if (!(await cabinetPeutAccederDossier(dossierId))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  let pieceChemin: string | null = null;
  let pieceNom: string | null = null;
  if (fichier) {
    const ext = extensionFichier(fichier.name);
    pieceChemin = `notes/${dossierId}/${randomUUID()}.${ext}`;
    pieceNom = fichier.name;
    await uploaderFichier(
      "documents",
      pieceChemin,
      Buffer.from(await fichier.arrayBuffer()),
      contentTypePourExtension(ext)
    );
  }

  const admin = createAdminClient();
  const { data: note, error } = await admin
    .from("notes")
    .insert({
      dossier_id: dossierId,
      campagne_id: campagneId,
      salarie_id: salarieId,
      auteur_id: profile.id,
      contenu,
      piece_chemin: pieceChemin,
      piece_nom: pieceNom,
    })
    .select("id")
    .single();
  if (error || !note) {
    return NextResponse.json({ error: "Échec de l'enregistrement." }, { status: 500 });
  }

  // Notifie l'autre partie
  const destinataires =
    profile.role === "client"
      ? await destinatairesCabinet(dossierId)
      : await destinatairesClient(dossierId);
  await notifier({
    userIds: destinataires,
    titre: "Nouvelle note sur le portail paie",
    corps: contenu ? contenu.slice(0, 200) : "Pièce jointe déposée.",
    lien:
      profile.role === "client"
        ? campagneId
          ? `/cabinet/campagnes/${campagneId}`
          : `/cabinet/dossiers/${dossierId}`
        : campagneId
          ? `/client/variables/${campagneId}`
          : "/client",
    email: false,
  });

  return NextResponse.json({ ok: true, id: note.id });
}
