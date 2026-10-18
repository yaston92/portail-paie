import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { cabinetPeutAccederDossier, getApiProfile } from "@/lib/auth";
import { refuserSansDroit } from "@/lib/droits";
import { documentSensible, estTypeDocumentSalarie } from "@/lib/documents-salarie";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  contentTypePourExtension,
  extensionFichier,
  supprimerFichiers,
  uploaderFichier,
} from "@/lib/storage";

export const runtime = "nodejs";

const TAILLE_MAX = 20 * 1024 * 1024;

async function salarieAccessible(salarieId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("salaries")
    .select("id, dossier_id")
    .eq("id", salarieId)
    .maybeSingle();
  return data;
}

/** Le cabinet dépose un document dans un compartiment de la fiche salarié. */
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
  const refus = await refuserSansDroit(profile, "salaries");
  if (refus) return refus;
  const { id } = await params;
  const salarie = await salarieAccessible(id);
  if (!salarie || !(await cabinetPeutAccederDossier(salarie.dossier_id))) {
    return NextResponse.json({ error: "Salarié inaccessible" }, { status: 403 });
  }

  const form = await request.formData();
  const type = String(form.get("type") ?? "");
  const fichier = form.get("fichier");
  if (!estTypeDocumentSalarie(type) || !(fichier instanceof File) || fichier.size === 0) {
    return NextResponse.json({ error: "Fichier ou compartiment invalide" }, { status: 400 });
  }
  if (fichier.size > TAILLE_MAX) {
    return NextResponse.json({ error: "Fichier trop volumineux (20 Mo maximum)." }, { status: 400 });
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

  const nom = (fichier.name || `${type}.${ext}`).split(/[/\\]/).pop()!.slice(0, 180);
  const chemin = `salaries/${salarie.dossier_id}/${id}/${type}/${randomUUID()}.${ext}`;
  await uploaderFichier(
    "documents",
    chemin,
    Buffer.from(await fichier.arrayBuffer()),
    contentTypePourExtension(ext)
  );

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("salarie_documents")
    .insert({
      salarie_id: id,
      dossier_id: salarie.dossier_id,
      type_document: type,
      chemin,
      nom_fichier: nom,
      sensible: documentSensible(type),
      uploaded_by: profile.id,
    })
    .select("id, type_document, nom_fichier, created_at, sensible")
    .single();
  if (error || !data) {
    await supprimerFichiers("documents", [chemin]);
    return NextResponse.json({ error: "Échec de l'enregistrement" }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** Le cabinet retire un document de la fiche. */
export async function DELETE(
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
  const refus = await refuserSansDroit(profile, "salaries");
  if (refus) return refus;
  const { id } = await params;
  const docId = new URL(request.url).searchParams.get("doc");
  if (!docId) {
    return NextResponse.json({ error: "Document manquant" }, { status: 400 });
  }
  const salarie = await salarieAccessible(id);
  if (!salarie || !(await cabinetPeutAccederDossier(salarie.dossier_id))) {
    return NextResponse.json({ error: "Salarié inaccessible" }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("salarie_documents")
    .select("id, chemin")
    .eq("id", docId)
    .eq("salarie_id", id)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }
  await admin.from("salarie_documents").delete().eq("id", docId);
  await supprimerFichiers("documents", [doc.chemin]);
  return NextResponse.json({ ok: true });
}
