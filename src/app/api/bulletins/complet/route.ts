import { NextResponse } from "next/server";
import { cabinetPeutAccederDossier, getApiProfile } from "@/lib/auth";
import { moisLabel } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { telechargerFichier } from "@/lib/storage";

/**
 * PDF d'origine, toutes les pages, pour l'employeur du dossier.
 */
export async function GET(request: Request) {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const url = new URL(request.url);
  const dossierId = url.searchParams.get("dossier") ?? "";
  const mois = url.searchParams.get("mois") ?? "";
  if (!dossierId || !/^\d{4}-\d{2}-01$/.test(mois)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const clientDuDossier = profile.role === "client" && profile.dossier_id === dossierId;
  const cabinet =
    profile.role !== "client" && (await cabinetPeutAccederDossier(dossierId));
  if (!clientDuDossier && !cabinet) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("bulletin_uploads")
    .select("chemin")
    .eq("dossier_id", dossierId)
    .eq("mois", mois)
    .eq("statut", "publie")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.chemin) {
    return NextResponse.json({ error: "PDF complet introuvable" }, { status: 404 });
  }

  const contenu = await telechargerFichier("bulletins", data.chemin);
  const nom = `Bulletins ${moisLabel(mois)}.pdf`;
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nom)}"`,
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
    },
  });
}
