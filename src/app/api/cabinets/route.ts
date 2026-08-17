import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  nom: z.string().trim().min(1).max(120),
});

/** Création d'un cabinet (directeur uniquement) + auto-membership admin. */
export async function POST(request: Request) {
  const profile = await getApiProfile(["directeur"]);
  if (!profile) {
    return NextResponse.json({ error: "Réservé au directeur" }, { status: 403 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }

  // Service role : contourne le piège RLS INSERT…RETURNING
  // (SELECT exige d'être membre avant que membership ne soit créé).
  const admin = createAdminClient();
  const { data: cabinet, error } = await admin
    .from("cabinets")
    .insert({ nom: body.data.nom })
    .select("*")
    .single();

  if (error || !cabinet) {
    return NextResponse.json(
      { error: error?.message ?? "Création impossible" },
      { status: 500 }
    );
  }

  const { error: membreError } = await admin.from("cabinet_membres").upsert(
    {
      cabinet_id: cabinet.id,
      profile_id: profile.id,
      role_membre: "admin",
    },
    { onConflict: "cabinet_id,profile_id" }
  );

  if (membreError) {
    return NextResponse.json(
      { error: membreError.message },
      { status: 500 }
    );
  }

  await journaliser({
    userId: profile.id,
    action: "cabinet_cree",
    cibleType: "cabinet",
    cibleId: cabinet.id,
    details: { nom: cabinet.nom },
  });

  return NextResponse.json({ ok: true, cabinet });
}
