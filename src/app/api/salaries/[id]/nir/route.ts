import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dechiffrer } from "@/lib/crypto";
import { journaliser } from "@/lib/audit";

/** Consultation du NIR (donnée sensible) : cabinet uniquement, journalisée. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id } = await params;

  const supabase = await createClient();
  const { data: salarie } = await supabase
    .from("salaries")
    .select("id, dossier_id")
    .eq("id", id)
    .maybeSingle();
  if (!salarie) {
    return NextResponse.json({ error: "Salarié inaccessible" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: sensible } = await admin
    .from("salaries_sensibles")
    .select("nir_chiffre")
    .eq("salarie_id", id)
    .maybeSingle();

  await journaliser({
    userId: profile.id,
    action: "consultation_nir",
    cibleType: "salarie",
    cibleId: id,
    dossierId: salarie.dossier_id,
  });

  if (!sensible?.nir_chiffre) {
    return NextResponse.json({ nir: null });
  }
  return NextResponse.json({ nir: dechiffrer(sensible.nir_chiffre) });
}
