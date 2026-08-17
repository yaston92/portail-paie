import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  nom: z.string().trim().min(1).max(120).optional(),
  archive: z.boolean().optional(),
});

/** Mise à jour / archivage d'un cabinet (directeur membre). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["directeur"]);
  if (!profile) {
    return NextResponse.json({ error: "Réservé au directeur" }, { status: 403 });
  }

  const { id } = await params;
  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const patch: { nom?: string; archive?: boolean } = {};
  if (body.data.nom !== undefined) patch.nom = body.data.nom;
  if (body.data.archive !== undefined) patch.archive = body.data.archive;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cabinets")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Mise à jour impossible" },
      { status: 500 }
    );
  }

  await journaliser({
    userId: profile.id,
    action: "cabinet_modifie",
    cibleType: "cabinet",
    cibleId: id,
    details: patch,
  });

  return NextResponse.json({ ok: true, cabinet: data });
}
