import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { creerJetonLectureBulletin } from "@/lib/lien-bulletin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Prépare un lien court pour afficher le bulletin dans le navigateur du téléphone. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("bulletins").select("id").eq("id", id).maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Bulletin inaccessible" }, { status: 403 });
  }
  const jeton = creerJetonLectureBulletin(id);
  const url = `${new URL(request.url).origin}/api/bulletins/lecture/${jeton}`;
  return NextResponse.json({ url });
}
