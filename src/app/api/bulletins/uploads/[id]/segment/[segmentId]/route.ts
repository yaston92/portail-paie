import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { telechargerFichier } from "@/lib/storage";
import { extrairePages } from "@/lib/pdf-bulletins";

export const runtime = "nodejs";

/** Aperçu PDF d'un segment (écran de contrôle, cabinet uniquement). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id, segmentId } = await params;

  // RLS : upload et segment visibles seulement si le dossier est accessible
  const supabase = await createClient();
  const [{ data: upload }, { data: segment }] = await Promise.all([
    supabase.from("bulletin_uploads").select("chemin").eq("id", id).maybeSingle(),
    supabase
      .from("bulletin_segments")
      .select("page_debut, page_fin")
      .eq("id", segmentId)
      .eq("upload_id", id)
      .maybeSingle(),
  ]);
  if (!upload || !segment) {
    return NextResponse.json({ error: "Segment inaccessible" }, { status: 403 });
  }

  const source = await telechargerFichier("bulletins", upload.chemin);
  const pdf = await extrairePages(source, segment.page_debut, segment.page_fin);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="segment-p${segment.page_debut}-p${segment.page_fin}.pdf"`,
    },
  });
}
