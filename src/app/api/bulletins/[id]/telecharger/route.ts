import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { telechargerFichier } from "@/lib/storage";

/**
 * Téléchargement d'un bulletin publié.
 * RLS : cabinet (portefeuille), client du dossier, ou le salarié pour les siens.
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
  const { data: bulletin } = await supabase
    .from("bulletins")
    .select("chemin, nom_fichier")
    .eq("id", id)
    .maybeSingle();
  if (!bulletin) {
    return NextResponse.json({ error: "Bulletin inaccessible" }, { status: 403 });
  }

  const contenu = await telechargerFichier("bulletins", bulletin.chemin);
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(bulletin.nom_fichier)}"`,
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
    },
  });
}
