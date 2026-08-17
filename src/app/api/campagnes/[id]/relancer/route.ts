import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { destinatairesClient, notifier } from "@/lib/notify";
import { journaliser } from "@/lib/audit";
import { formatDate, moisLabel } from "@/lib/format";

/** Relance manuelle d'un client sur une campagne ouverte (cabinet). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id } = await params;

  const supabase = await createClient();
  const { data: campagne } = await supabase
    .from("campagnes")
    .select("id, dossier_id, mois, date_limite, statut")
    .eq("id", id)
    .maybeSingle();
  if (!campagne) {
    return NextResponse.json({ error: "Campagne inaccessible" }, { status: 403 });
  }
  if (campagne.statut !== "ouverte") {
    return NextResponse.json({ error: "Campagne déjà clôturée." }, { status: 400 });
  }

  await notifier({
    userIds: await destinatairesClient(campagne.dossier_id),
    titre: `Relance : variables de paie ${moisLabel(campagne.mois)}`,
    corps: `Merci de nous transmettre vos variables de paie avant le ${formatDate(campagne.date_limite)}.`,
    lien: `/client/variables/${id}`,
  });

  const admin = createAdminClient();
  await admin
    .from("campagnes")
    .update({ derniere_relance_at: new Date().toISOString() })
    .eq("id", id);

  await journaliser({
    userId: profile.id,
    action: "relance_campagne",
    cibleType: "campagne",
    cibleId: id,
    dossierId: campagne.dossier_id,
  });

  return NextResponse.json({ ok: true });
}
