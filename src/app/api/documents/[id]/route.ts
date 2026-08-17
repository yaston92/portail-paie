import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { journaliser } from "@/lib/audit";
import { contentTypePourExtension, telechargerFichier } from "@/lib/storage";

/**
 * Téléchargement d'un document salarié.
 * Accès : cabinet (portefeuille), client du dossier, ou le salarié lui-même.
 * La RLS sur salarie_documents fait foi ; les consultations sensibles sont journalisées.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("salarie_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Le salarié n'a pas de policy sur salarie_documents : on vérifie que le
  // document appartient à sa propre fiche via son profil.
  let document = doc;
  if (!document && profile.role === "salarie" && profile.salarie_id) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data: docSalarie } = await admin
      .from("salarie_documents")
      .select("*")
      .eq("id", id)
      .eq("salarie_id", profile.salarie_id)
      .maybeSingle();
    document = docSalarie;
  }

  if (!document) {
    return NextResponse.json({ error: "Document inaccessible" }, { status: 403 });
  }

  if (document.sensible) {
    await journaliser({
      userId: profile.id,
      action: "telechargement_document_sensible",
      cibleType: "document",
      cibleId: id,
      dossierId: document.dossier_id,
      details: { type: document.type_document },
    });
  }

  const contenu = await telechargerFichier("documents", document.chemin);
  const nom = document.nom_fichier || document.chemin.split("/").pop() || "document";
  const ext = nom.includes(".") ? nom.split(".").pop()!.toLowerCase() : "bin";
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Disposition": `attachment; filename="${nom.replace(/"/g, "")}"`,
      "Content-Type": contentTypePourExtension(ext),
      "Cache-Control": "private, no-store",
    },
  });
}
