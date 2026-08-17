import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";
import { destinatairesClient, notifier } from "@/lib/notify";
import { moisLabel } from "@/lib/format";

/**
 * Ouvre de nouveau une campagne clôturée (envoyée ou paies identiques)
 * pour permettre des corrections côté client.
 */
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
    .select("id, dossier_id, mois, statut")
    .eq("id", id)
    .maybeSingle();
  if (!campagne) {
    return NextResponse.json({ error: "Campagne inaccessible" }, { status: 403 });
  }
  if (campagne.statut === "ouverte") {
    return NextResponse.json({ error: "La campagne est déjà ouverte." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("campagnes")
    .update({
      statut: "ouverte",
      // Accès direct à la saisie (pas de re-question « identiques »)
      paies_identiques: false,
      envoyee_at: null,
      recap_chemin: null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: dossier } = await admin
    .from("dossiers")
    .select("sigle")
    .eq("id", campagne.dossier_id)
    .single();

  await notifier({
    userIds: await destinatairesClient(campagne.dossier_id),
    titre: `${dossier?.sigle ?? ""} : saisie des variables de nouveau ouverte (${moisLabel(campagne.mois)})`,
    corps:
      "Le cabinet a de nouveau ouvert la saisie pour corrections. Vous pouvez modifier vos variables puis les renvoyer.",
    lien: `/client/variables/${id}`,
  });

  await journaliser({
    userId: profile.id,
    action: "campagne_rouverte",
    cibleType: "campagne",
    cibleId: id,
    dossierId: campagne.dossier_id,
    details: { ancien_statut: campagne.statut },
  });

  return NextResponse.json({ ok: true });
}
