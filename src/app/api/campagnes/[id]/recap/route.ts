import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { telechargerFichier } from "@/lib/storage";
import { moisFichier } from "@/lib/format";

/** Téléchargement du récap PDF d'une campagne (cabinet + client du dossier). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur", "client"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;

  const supabase = await createClient();
  const { data: campagne } = await supabase
    .from("campagnes")
    .select("recap_chemin, mois")
    .eq("id", id)
    .maybeSingle();
  if (!campagne?.recap_chemin) {
    return NextResponse.json({ error: "Récapitulatif indisponible" }, { status: 404 });
  }

  const contenu = await telechargerFichier("documents", campagne.recap_chemin);
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Disposition": `attachment; filename="recap-variables-${moisFichier(campagne.mois)}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}
