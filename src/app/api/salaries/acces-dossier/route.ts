import { NextResponse } from "next/server";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { getAccesSalariesBatch } from "@/lib/acces-salarie";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Accès espace salarié en lot pour un dossier (évite N× GET /acces).
 * Query : ?dossier_id=…
 */
export async function GET(request: Request) {
  const profile = await getApiProfile([
    "client",
    "admin_cabinet",
    "collaborateur",
  ]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const dossierId =
    new URL(request.url).searchParams.get("dossier_id") || profile.dossier_id;
  if (!dossierId) {
    return NextResponse.json({ error: "dossier_id requis" }, { status: 400 });
  }

  if (profile.role === "client") {
    if (profile.dossier_id !== dossierId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
  } else {
    const ok = await cabinetPeutAccederDossier(dossierId);
    if (!ok) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
  }

  const admin = createAdminClient();
  const { data: salaries } = await admin
    .from("salaries")
    .select("id")
    .eq("dossier_id", dossierId);

  const ids = (salaries ?? []).map((s) => s.id as string);
  const map = await getAccesSalariesBatch(ids);
  const payload: Record<string, unknown> = {};
  for (const [id, info] of map) payload[id] = info;
  return NextResponse.json(payload);
}
