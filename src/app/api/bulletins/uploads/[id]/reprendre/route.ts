import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { identifiantDepot, reprendreDepot } from "@/lib/depot-bulletin";
import { refuserSansDroit } from "@/lib/droits-serveur";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Reprend un découpage qui n'a pas écrit son nombre de pages. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const refus = await refuserSansDroit(profile, "bulletins");
  if (refus) return refus;

  const { id } = await params;
  if (!identifiantDepot(id)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("bulletin_uploads")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Dépôt inaccessible" }, { status: 403 });
  }

  const etat = await reprendreDepot(createAdminClient(), id);
  if (etat === "absent") {
    return NextResponse.json({ error: "Dépôt inaccessible" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, etat });
}
