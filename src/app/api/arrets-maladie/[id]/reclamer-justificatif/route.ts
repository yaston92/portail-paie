import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import { formatDate } from "@/lib/format";
import { destinatairesClient, notifier } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

/**
 * Le cabinet réclame le justificatif manquant d'un arrêt maladie :
 * notifie le client du dossier et le salarié s'il a un accès.
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
  const { data: arret } = await supabase
    .from("arrets_maladie")
    .select(
      "id, dossier_id, salarie_id, date_debut, date_fin, justificatif_chemin, salaries(nom, prenom, profile_id), dossiers(sigle)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!arret) {
    return NextResponse.json({ error: "Arrêt introuvable" }, { status: 404 });
  }
  if (arret.justificatif_chemin) {
    return NextResponse.json(
      { error: "Un justificatif est déjà déposé." },
      { status: 400 }
    );
  }

  const salariesJoin = arret.salaries as
    | { nom: string; prenom: string; profile_id: string | null }
    | { nom: string; prenom: string; profile_id: string | null }[]
    | null
    | undefined;
  const salarie = Array.isArray(salariesJoin) ? salariesJoin[0] : salariesJoin;
  const dossiersJoin = arret.dossiers as
    | { sigle: string }
    | { sigle: string }[]
    | null
    | undefined;
  const dossier = Array.isArray(dossiersJoin) ? dossiersJoin[0] : dossiersJoin;
  const nomSalarie = salarie
    ? `${salarie.prenom} ${salarie.nom}`
    : "le salarié";
  const titre = `${dossier?.sigle ?? "Dossier"} : justificatif d'arrêt manquant`;
  const corps = `Merci de déposer le justificatif d'arrêt maladie pour ${nomSalarie} (${formatDate(arret.date_debut)} → ${formatDate(arret.date_fin)}).`;

  const clients = await destinatairesClient(arret.dossier_id);
  if (clients.length > 0) {
    await notifier({
      userIds: clients,
      titre,
      corps,
      lien: "/client/arrets-maladie",
    });
  }
  if (salarie?.profile_id) {
    await notifier({
      userIds: [salarie.profile_id],
      titre: "Justificatif d'arrêt manquant",
      corps: `Le cabinet vous demande de déposer le justificatif de votre arrêt (${formatDate(arret.date_debut)} → ${formatDate(arret.date_fin)}).`,
      lien: "/salarie",
    });
  }

  if (clients.length === 0 && !salarie?.profile_id) {
    return NextResponse.json(
      {
        error:
          "Aucun destinataire : pas d'accès client ni d'espace salarié sur ce dossier.",
      },
      { status: 400 }
    );
  }

  await journaliser({
    userId: profile.id,
    action: "reclamer_justificatif_arret",
    cibleType: "arret_maladie",
    cibleId: id,
    dossierId: arret.dossier_id,
  });

  return NextResponse.json({ ok: true });
}
