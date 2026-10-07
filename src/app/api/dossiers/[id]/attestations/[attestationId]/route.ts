import { NextResponse } from "next/server";
import { cabinetPeutAccederDossier, getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contentTypePourExtension, supprimerFichiers, telechargerFichier } from "@/lib/storage";

export const runtime = "nodejs";

/** Télécharge une attestation si le dossier est lisible (cabinet ou client). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; attestationId: string }> }
) {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id: dossierId, attestationId } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("dossier_attestations")
    .select("id, nom_fichier, chemin")
    .eq("id", attestationId)
    .eq("dossier_id", dossierId)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document inaccessible" }, { status: 403 });
  }

  const contenu = await telechargerFichier("documents", doc.chemin);
  const nom = doc.nom_fichier || "attestation";
  const ext = nom.includes(".") ? nom.split(".").pop()!.toLowerCase() : "bin";
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Disposition": `attachment; filename="${nom.replace(/"/g, "")}"`,
      "Content-Type": contentTypePourExtension(ext),
      "Cache-Control": "private, no-store",
    },
  });
}

/** Le cabinet retire une attestation du dossier. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; attestationId: string }> }
) {
  const profile = await getApiProfile([
    "directeur",
    "admin_cabinet",
    "collaborateur",
  ]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id: dossierId, attestationId } = await params;
  if (!(await cabinetPeutAccederDossier(dossierId))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("dossier_attestations")
    .select("id, chemin")
    .eq("id", attestationId)
    .eq("dossier_id", dossierId)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Attestation introuvable" }, { status: 404 });
  }

  const { error } = await admin
    .from("dossier_attestations")
    .delete()
    .eq("id", attestationId);
  if (error) {
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
  await supprimerFichiers("documents", [doc.chemin]);
  return NextResponse.json({ ok: true });
}
