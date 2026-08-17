import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";
import { destinatairesCabinet, notifier } from "@/lib/notify";

const schema = z.object({ opposition: z.boolean() });

/**
 * Droit d'opposition du salarié au bulletin dématérialisé.
 * En cas d'opposition, l'employeur doit remettre le bulletin sous forme papier ;
 * le cabinet est notifié.
 */
export async function POST(request: Request) {
  const profile = await getApiProfile(["salarie"]);
  if (!profile?.salarie_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: salarie } = await admin
    .from("salaries")
    .select("id, dossier_id, nom, prenom")
    .eq("id", profile.salarie_id)
    .single();
  if (!salarie) {
    return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
  }

  await admin
    .from("salaries")
    .update({ opposition_bulletin: body.data.opposition })
    .eq("id", profile.salarie_id);

  await journaliser({
    userId: profile.id,
    action: body.data.opposition
      ? "opposition_bulletin_dematerialise"
      : "levee_opposition_bulletin",
    cibleType: "salarie",
    cibleId: profile.salarie_id,
    dossierId: salarie.dossier_id,
  });

  await notifier({
    userIds: await destinatairesCabinet(salarie.dossier_id),
    titre: body.data.opposition
      ? "Opposition au bulletin dématérialisé"
      : "Levée d'opposition au bulletin dématérialisé",
    corps: `${salarie.nom} ${salarie.prenom} a ${body.data.opposition ? "exercé son droit d'opposition : remise papier obligatoire" : "levé son opposition : diffusion dématérialisée possible"}.`,
    lien: `/cabinet/salaries/${salarie.id}`,
  });

  return NextResponse.json({ ok: true });
}
