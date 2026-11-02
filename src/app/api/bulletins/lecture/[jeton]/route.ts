import { NextResponse } from "next/server";
import { lireJetonLectureBulletin } from "@/lib/lien-bulletin";
import { telechargerFichier } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** PDF affichable quelques minutes, ouvert depuis l'application. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jeton: string }> }
) {
  const { jeton } = await params;
  const id = lireJetonLectureBulletin(decodeURIComponent(jeton));
  if (!id) {
    return NextResponse.json({ error: "Lien expiré." }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data: bulletin } = await admin
    .from("bulletins")
    .select("chemin, nom_fichier")
    .eq("id", id)
    .maybeSingle();
  if (!bulletin) {
    return NextResponse.json({ error: "Bulletin introuvable." }, { status: 404 });
  }
  const contenu = await telechargerFichier("bulletins", bulletin.chemin);
  const nom = String(bulletin.nom_fichier || "bulletin.pdf").replace(/"/g, "");
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Disposition": `inline; filename="${nom}"`,
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
    },
  });
}
