import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { journaliser } from "@/lib/audit";
import { contentTypePourExtension, telechargerFichier } from "@/lib/storage";
import type { Embauche } from "@/lib/types";

/**
 * Téléchargement d'une pièce d'embauche (recto, verso, carte_vitale).
 * Accès : cabinet (portefeuille) ou client du dossier : via RLS. Journalisé.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  const profile = await getApiProfile([
    "directeur",
    "admin_cabinet",
    "collaborateur",
    "client",
  ]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { id, type } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("embauches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Embauche inaccessible" }, { status: 403 });
  }
  const embauche = data as Embauche;

  let chemin: string | null = null;
  if (type === "recto") chemin = embauche.piece_identite_recto_chemin;
  else if (type === "verso") chemin = embauche.piece_identite_verso_chemin;
  else if (type === "carte_vitale") chemin = embauche.carte_vitale_chemin;
  else {
    return NextResponse.json({ error: "Type de pièce invalide" }, { status: 400 });
  }

  if (!chemin) {
    return NextResponse.json({ error: "Pièce absente" }, { status: 404 });
  }

  await journaliser({
    userId: profile.id,
    action: "telechargement_piece_embauche",
    cibleType: "embauche",
    cibleId: id,
    dossierId: embauche.dossier_id,
    details: { type },
  });

  try {
    const contenu = await telechargerFichier("documents", chemin);
    const nom = chemin.split("/").pop() ?? "piece";
    const ext = nom.includes(".") ? nom.split(".").pop()!.toLowerCase() : "bin";
    const telecharger = new URL(request.url).searchParams.get("telecharger") === "1";
    const estImage = ["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext);
    const disposition =
      telecharger || !estImage
        ? `attachment; filename="${nom.replace(/"/g, "")}"`
        : `inline; filename="${nom.replace(/"/g, "")}"`;
    return new NextResponse(new Uint8Array(contenu), {
      headers: {
        "Content-Disposition": disposition,
        "Content-Type": contentTypePourExtension(ext),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[embauches/piece]", e);
    return NextResponse.json(
      { error: "Fichier introuvable ou inaccessible." },
      { status: 404 }
    );
  }
}
