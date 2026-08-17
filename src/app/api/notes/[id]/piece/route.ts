import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { telechargerFichier } from "@/lib/storage";

/** Téléchargement de la pièce jointe d'une note (RLS : cabinet + client du dossier). */
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
  const { data: note } = await supabase
    .from("notes")
    .select("piece_chemin, piece_nom")
    .eq("id", id)
    .maybeSingle();
  if (!note?.piece_chemin) {
    return NextResponse.json({ error: "Pièce inaccessible" }, { status: 404 });
  }

  const contenu = await telechargerFichier("documents", note.piece_chemin);
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(note.piece_nom ?? "piece")}"`,
      "Content-Type": "application/octet-stream",
    },
  });
}
