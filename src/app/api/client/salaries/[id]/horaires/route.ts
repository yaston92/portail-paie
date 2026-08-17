import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import {
  JOURS_SEMAINE,
  normaliserHoraires,
  sommeHebdo,
  type HorairesSemaine,
} from "@/lib/horaires";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const schema = z.object({
  lun: z.coerce.number().min(0).max(24),
  mar: z.coerce.number().min(0).max(24),
  mer: z.coerce.number().min(0).max(24),
  jeu: z.coerce.number().min(0).max(24),
  ven: z.coerce.number().min(0).max(24),
  sam: z.coerce.number().min(0).max(24),
  dim: z.coerce.number().min(0).max(24),
});

/** Mise à jour des horaires hebdomadaires par le client (employeur). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["client"]);
  if (!profile?.dossier_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id } = await params;
  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "Horaires invalides (0–24 h par jour)." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: salarie } = await supabase
    .from("salaries")
    .select("id, dossier_id, duree_hebdo")
    .eq("id", id)
    .eq("dossier_id", profile.dossier_id)
    .maybeSingle();

  if (!salarie) {
    return NextResponse.json({ error: "Salarié introuvable" }, { status: 404 });
  }

  const horaires = normaliserHoraires(body.data) as HorairesSemaine;
  const dureeHebdo = sommeHebdo(horaires);

  const admin = createAdminClient();
  const { error } = await admin
    .from("salaries")
    .update({
      horaires: Object.fromEntries(
        JOURS_SEMAINE.map((j) => [j, horaires[j]])
      ),
      duree_hebdo: dureeHebdo > 0 ? dureeHebdo : null,
    })
    .eq("id", id)
    .eq("dossier_id", profile.dossier_id);

  if (error) {
    return NextResponse.json(
      { error: "Échec de l'enregistrement : " + error.message },
      { status: 500 }
    );
  }

  await journaliser({
    userId: profile.id,
    action: "horaires_salarie",
    cibleType: "salarie",
    cibleId: id,
    dossierId: profile.dossier_id,
    details: { horaires, duree_hebdo: dureeHebdo },
  });

  return NextResponse.json({ ok: true, horaires, duree_hebdo: dureeHebdo });
}
