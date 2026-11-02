import { NextResponse } from "next/server";
import { cabinetPeutAccederDossier, getApiProfile } from "@/lib/auth";
import { cheminDepotBulletin, identifiantDepot } from "@/lib/depot-bulletin";
import { refuserSansDroit } from "@/lib/droits-serveur";
import { supprimerFichiers } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Retire un dépôt qui n'a pas abouti, fichier compris. */
export async function POST(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const refus = await refuserSansDroit(profile, "bulletins");
  if (refus) return refus;

  const corps = (await request.json().catch(() => null)) as {
    id?: string;
    dossier_id?: string;
  } | null;
  const id = corps?.id ?? "";
  const dossierId = corps?.dossier_id ?? "";
  if (!identifiantDepot(id) || !identifiantDepot(dossierId)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  if (!(await cabinetPeutAccederDossier(dossierId))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: existant } = await admin
    .from("bulletin_uploads")
    .select("id, dossier_id, nb_pages, statut")
    .eq("id", id)
    .maybeSingle();
  if (existant && (existant.dossier_id !== dossierId || existant.statut === "publie")) {
    return NextResponse.json({ error: "Ce dépôt ne peut pas être annulé." }, { status: 400 });
  }
  if (existant && existant.nb_pages != null && existant.nb_pages > 0) {
    return NextResponse.json({ error: "Ce dépôt est déjà analysé." }, { status: 400 });
  }

  await supprimerFichiers("bulletins", [cheminDepotBulletin(dossierId, id)]);
  if (existant) {
    await admin.from("bulletin_uploads").delete().eq("id", id);
  }
  return NextResponse.json({ ok: true });
}
