import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { cabinetPeutAccederDossier, getApiProfile } from "@/lib/auth";
import { estTypeAttestation } from "@/lib/attestations";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  contentTypePourExtension,
  extensionFichier,
  supprimerFichiers,
  uploaderFichier,
} from "@/lib/storage";

export const runtime = "nodejs";

const TAILLE_MAX = 20 * 1024 * 1024;

/** Le cabinet dépose une attestation sur le dossier client. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile([
    "directeur",
    "admin_cabinet",
    "collaborateur",
  ]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id: dossierId } = await params;
  if (!(await cabinetPeutAccederDossier(dossierId))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  const form = await request.formData();
  const type = String(form.get("type") ?? "");
  const fichier = form.get("fichier");
  if (!estTypeAttestation(type) || !(fichier instanceof File) || fichier.size === 0) {
    return NextResponse.json({ error: "Fichier ou type invalide" }, { status: 400 });
  }
  if (fichier.size > TAILLE_MAX) {
    return NextResponse.json(
      { error: "Fichier trop volumineux (20 Mo maximum)." },
      { status: 400 }
    );
  }

  let ext: string;
  try {
    ext = extensionFichier(fichier.name || type, fichier.type);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Type de fichier non autorisé" },
      { status: 400 }
    );
  }
  if (!["pdf", "jpg", "jpeg", "png", "heic"].includes(ext)) {
    return NextResponse.json(
      { error: "Déposez un PDF ou une photo (JPG, PNG)." },
      { status: 400 }
    );
  }

  const nom = (fichier.name || `attestation.${ext}`).split(/[/\\]/).pop()!.slice(0, 180);
  const chemin = `attestations/${dossierId}/${type}/${randomUUID()}.${ext}`;
  try {
    await uploaderFichier(
      "documents",
      chemin,
      Buffer.from(await fichier.arrayBuffer()),
      contentTypePourExtension(ext)
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Échec du dépôt" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dossier_attestations")
    .insert({
      dossier_id: dossierId,
      type,
      nom_fichier: nom,
      chemin,
      uploaded_by: profile.id,
    })
    .select("id, dossier_id, type, nom_fichier, created_at")
    .single();

  if (error || !data) {
    await supprimerFichiers("documents", [chemin]);
    return NextResponse.json(
      { error: "Échec de l'enregistrement. La migration des attestations est-elle exécutée ?" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
