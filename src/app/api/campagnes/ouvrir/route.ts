import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ouvrirCampagnesManquantes } from "@/lib/ouvrir-campagnes";

const schema = z.object({
  mois: z.string().regex(/^\d{4}-\d{2}-01$/),
  date_limite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dossier_ids: z.array(z.string().uuid()).optional(),
});

/**
 * Ouverture manuelle des campagnes mensuelles de variables de paie.
 * Sans dossier_ids : ouvre pour tous les dossiers actifs accessibles
 * qui n'ont pas encore de campagne sur ce mois.
 */
export async function POST(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { mois, date_limite, dossier_ids } = body.data;

  // Respecte le périmètre RLS du collaborateur (dossiers accessibles)
  const supabase = await createClient();
  let query = supabase.from("dossiers").select("id").eq("archive", false);
  if (dossier_ids) query = query.in("id", dossier_ids);
  const { data: dossiers } = await query;
  if (!dossiers || dossiers.length === 0) {
    return NextResponse.json({ error: "Aucun dossier accessible." }, { status: 400 });
  }

  try {
    const resultat = await ouvrirCampagnesManquantes({
      mois,
      dateLimite: date_limite,
      dossierIds: dossiers.map((d) => d.id),
      userId: profile.id,
      action: "ouverture_campagnes",
    });
    return NextResponse.json({ ok: true, ...resultat });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Échec de l'ouverture." },
      { status: 500 }
    );
  }
}
