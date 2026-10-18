import { NextResponse } from "next/server";
import { z } from "zod";
import { journaliser } from "@/lib/audit";
import { getCabinetActif } from "@/lib/cabinet";
import {
  DROITS_COLLABORATEUR,
  DROITS_TOUS,
  lireDroits,
  type DroitCollaborateur,
  type DroitsCollaborateur,
} from "@/lib/droits";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  profile_id: z.string().uuid(),
  cabinet_id: z.string().uuid().optional(),
  droits: z.object({
    salaries: z.boolean(),
    embauches: z.boolean(),
    bulletins: z.boolean(),
    variables: z.boolean(),
    absences: z.boolean(),
  }),
});

/** Le directeur règle les actions autorisées d'un collaborateur. */
export async function PATCH(request: Request) {
  const acteur = await getApiProfile(["directeur"]);
  if (!acteur) {
    return NextResponse.json(
      { error: "Seul le directeur peut modifier ces droits." },
      { status: 403 }
    );
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const cabinetActif = await getCabinetActif();
  if (!cabinetActif) {
    return NextResponse.json({ error: "Aucun cabinet actif" }, { status: 400 });
  }
  const cabinetId = body.data.cabinet_id ?? cabinetActif.id;
  if (cabinetId !== cabinetActif.id) {
    return NextResponse.json({ error: "Cabinet inaccessible" }, { status: 403 });
  }
  if (body.data.profile_id === acteur.id) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas modifier vos propres droits." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: membre } = await admin
    .from("cabinet_membres")
    .select("role_membre, profile:profiles (id, role, email)")
    .eq("cabinet_id", cabinetId)
    .eq("profile_id", body.data.profile_id)
    .maybeSingle();
  if (!membre) {
    return NextResponse.json({ error: "Ce membre n'appartient pas à ce cabinet" }, { status: 404 });
  }

  const rawProfil = (
    membre as unknown as {
      profile?: { role: string; email: string } | { role: string; email: string }[] | null;
    }
  ).profile;
  const cible = Array.isArray(rawProfil) ? rawProfil[0] : rawProfil;
  const roleMembre = (membre as { role_membre: string }).role_membre;
  if (!cible || cible.role !== "collaborateur" || roleMembre !== "collaborateur") {
    return NextResponse.json(
      { error: "Ces droits concernent uniquement un collaborateur." },
      { status: 400 }
    );
  }

  const droits: DroitsCollaborateur = { ...DROITS_TOUS };
  for (const droit of DROITS_COLLABORATEUR) {
    droits[droit.id] = body.data.droits[droit.id as DroitCollaborateur];
  }

  const { error } = await admin
    .from("cabinet_membres")
    .update({ droits })
    .eq("cabinet_id", cabinetId)
    .eq("profile_id", body.data.profile_id);
  if (error) {
    return NextResponse.json(
      { error: "Impossible d'enregistrer les droits." },
      { status: 500 }
    );
  }

  await journaliser({
    userId: acteur.id,
    action: "droits_collaborateur",
    cibleType: "user",
    cibleId: body.data.profile_id,
    details: {
      cabinet_id: cabinetId,
      email: cible.email,
      droits,
    },
  });

  return NextResponse.json({ ok: true, droits: lireDroits(droits) });
}
