import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { destinatairesClientsParDossier, notifier } from "@/lib/notify";
import { journaliser } from "@/lib/audit";
import { formatDate, moisLabel } from "@/lib/format";

const schema = z.object({
  mois: z.string().regex(/^\d{4}-\d{2}-01$/),
  collaborateur_id: z.string().uuid().optional(),
});

/** Relance groupée : tous les dossiers en retard (campagne ouverte) sur un mois. */
export async function POST(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { mois, collaborateur_id } = body.data;

  const supabase = await createClient();
  const { data: campagnes } = await supabase
    .from("campagnes")
    .select("id, dossier_id, date_limite")
    .eq("mois", mois)
    .eq("statut", "ouverte");

  let cibles = campagnes ?? [];
  if (collaborateur_id && cibles.length > 0) {
    const [{ data: dossiers }, { data: liens }] = await Promise.all([
      supabase.from("dossiers").select("id").eq("collaborateur_id", collaborateur_id),
      supabase
        .from("dossier_collaborateurs")
        .select("dossier_id")
        .eq("profile_id", collaborateur_id),
    ]);
    const ids = new Set([
      ...(dossiers ?? []).map((d) => d.id),
      ...((liens ?? []) as { dossier_id: string }[]).map((l) => l.dossier_id),
    ]);
    cibles = cibles.filter((c) => ids.has(c.dossier_id));
  }

  if (cibles.length === 0) {
    return NextResponse.json({ ok: true, relancees: 0 });
  }

  const clientsParDossier = await destinatairesClientsParDossier(
    cibles.map((c) => c.dossier_id)
  );
  const admin = createAdminClient();
  const maintenant = new Date().toISOString();
  const titre = `Relance : variables de paie ${moisLabel(mois)}`;

  const lot = 8;
  for (let i = 0; i < cibles.length; i += lot) {
    const slice = cibles.slice(i, i + lot);
    await Promise.all(
      slice.map(async (c) => {
        await notifier({
          userIds: clientsParDossier.get(c.dossier_id) ?? [],
          titre,
          corps: `Merci de nous transmettre vos variables de paie${
            c.date_limite ? ` avant le ${formatDate(c.date_limite)}` : ""
          }.`,
          lien: `/client/variables/${c.id}`,
        });
        await admin
          .from("campagnes")
          .update({ derniere_relance_at: maintenant })
          .eq("id", c.id);
      })
    );
  }

  await journaliser({
    userId: profile.id,
    action: "relance_groupee",
    details: { mois, relancees: cibles.length },
  });

  return NextResponse.json({ ok: true, relancees: cibles.length });
}
