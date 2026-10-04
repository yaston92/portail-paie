import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { journaliser } from "@/lib/audit";
import { destinatairesClient, notifier } from "@/lib/notify";

const schema = z.object({ commentaire: z.string().min(1) });

/** Retour d'une embauche au client pour complément. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["directeur", "admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id } = await params;

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "Indiquez le motif du retour." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: embauche } = await supabase
    .from("embauches")
    .select("id, dossier_id, nom, prenom, statut")
    .eq("id", id)
    .maybeSingle();
  if (!embauche) {
    return NextResponse.json({ error: "Embauche inaccessible" }, { status: 403 });
  }
  if (embauche.statut === "valide") {
    return NextResponse.json({ error: "Embauche déjà validée." }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin
    .from("embauches")
    .update({
      statut: "retourne",
      commentaire_retour: body.data.commentaire,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await journaliser({
    userId: profile.id,
    action: "embauche_retournee",
    cibleType: "embauche",
    cibleId: id,
    dossierId: embauche.dossier_id,
  });

  await notifier({
    userIds: await destinatairesClient(embauche.dossier_id),
    titre: "Embauche à compléter",
    corps: `L'embauche de ${embauche.nom} ${embauche.prenom} vous a été retournée : ${body.data.commentaire}`,
    lien: `/client/embauches/${id}`,
  });

  return NextResponse.json({ ok: true });
}
