import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { contentTypePourExtension, telechargerFichier } from "@/lib/storage";

export const runtime = "nodejs";

/** Téléchargement du justificatif d'arrêt maladie. */
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
  let { data: arret } = await supabase
    .from("arrets_maladie")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Filet salarié si RLS restrictive sur lecture croisée
  if (!arret && profile.role === "salarie" && profile.salarie_id) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("arrets_maladie")
      .select("*")
      .eq("id", id)
      .eq("salarie_id", profile.salarie_id)
      .maybeSingle();
    arret = data;
  }

  if (!arret?.justificatif_chemin) {
    return NextResponse.json({ error: "Justificatif introuvable" }, { status: 404 });
  }

  const buf = await telechargerFichier("documents", arret.justificatif_chemin);
  const ext = (arret.justificatif_nom ?? arret.justificatif_chemin)
    .split(".")
    .pop()
    ?.toLowerCase() ?? "pdf";
  const nom = arret.justificatif_nom ?? `arret-maladie.${ext}`;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": contentTypePourExtension(ext),
      "content-disposition": `attachment; filename="${nom.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
    },
  });
}
