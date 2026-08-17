import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { telechargerFichier } from "@/lib/storage";
import { moisFichier } from "@/lib/format";
import type { Bulletin } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Archive ZIP des bulletins d'un dossier pour un mois donné.
 * ?dossier=…&mois=YYYY-MM-01 : accès cabinet ou client du dossier (via RLS).
 */
export async function GET(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur", "client"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dossierId = searchParams.get("dossier") ?? "";
  const mois = searchParams.get("mois") ?? "";
  if (!dossierId || !/^\d{4}-\d{2}-01$/.test(mois)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("bulletins")
    .select("*")
    .eq("dossier_id", dossierId)
    .eq("mois", mois);
  const bulletins = (data ?? []) as Bulletin[];
  if (bulletins.length === 0) {
    return NextResponse.json({ error: "Aucun bulletin pour ce mois." }, { status: 404 });
  }

  const zip = new JSZip();
  const fichiers = await Promise.all(
    bulletins.map(async (b) => {
      const contenu = await telechargerFichier("bulletins", b.chemin);
      return { nom: b.nom_fichier, contenu };
    })
  );
  for (const f of fichiers) {
    zip.file(f.nom, f.contenu);
  }
  const archive = await zip.generateAsync({ type: "nodebuffer" });

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "Content-Disposition": `attachment; filename="bulletins-${moisFichier(mois)}.zip"`,
      "Content-Type": "application/zip",
    },
  });
}
