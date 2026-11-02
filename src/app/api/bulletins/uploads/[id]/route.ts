import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import { identifiantDepot } from "@/lib/depot-bulletin";
import { refuserSansDroit } from "@/lib/droits-serveur";
import { moisLabel } from "@/lib/format";
import { destinatairesClient, notifier } from "@/lib/notify";
import { supprimerFichiers } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { BulletinUpload } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Supprime un dépôt de bulletins en entier : le PDF global, le découpage,
 * et les bulletins déjà publiés à partir de ce dépôt.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const refus = await refuserSansDroit(profile, "bulletins");
  if (refus) return refus;

  const { id } = await params;
  if (!identifiantDepot(id)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: uploadData } = await supabase
    .from("bulletin_uploads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!uploadData) {
    return NextResponse.json({ error: "Dépôt inaccessible" }, { status: 403 });
  }
  const upload = uploadData as BulletinUpload;

  const admin = createAdminClient();
  const { data: bulletins } = await admin
    .from("bulletins")
    .select("id, chemin, salarie_id")
    .eq("upload_id", id);
  const publies = bulletins ?? [];
  const salarieIds = publies.map((b) => b.salarie_id).filter(Boolean);

  if (publies.length > 0) {
    const { error } = await admin.from("bulletins").delete().eq("upload_id", id);
    if (error) {
      return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
    }
    await admin
      .from("soldes_cp")
      .delete()
      .in("salarie_id", salarieIds)
      .eq("mois_reference", upload.mois)
      .eq("source", "extraction");
  }

  const { error: erreurDepot } = await admin
    .from("bulletin_uploads")
    .delete()
    .eq("id", id);
  if (erreurDepot) {
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }

  const chemins = [upload.chemin, ...publies.map((b) => b.chemin)].filter(Boolean);
  try {
    await supprimerFichiers("bulletins", chemins);
  } catch (e) {
    console.error("[bulletins DELETE] storage", e);
  }

  const { count } = await admin
    .from("bulletins")
    .select("id", { count: "exact", head: true })
    .eq("dossier_id", upload.dossier_id)
    .eq("mois", upload.mois);
  if (!count) {
    await admin
      .from("campagnes")
      .update({ statut: "envoyee", traitee_at: null })
      .eq("dossier_id", upload.dossier_id)
      .eq("mois", upload.mois)
      .eq("statut", "bulletins_envoyes");
  }

  await journaliser({
    userId: profile.id,
    action: "suppression_depot_bulletins",
    cibleType: "bulletin_upload",
    cibleId: id,
    dossierId: upload.dossier_id,
    details: { mois: upload.mois, bulletins_retires: publies.length },
  });

  if (publies.length > 0) {
    const { data: salaries } = await admin
      .from("salaries")
      .select("profile_id")
      .in("id", salarieIds);
    const comptes = (salaries ?? [])
      .map((s) => s.profile_id as string | null)
      .filter((pid): pid is string => !!pid);
    const libelle = moisLabel(upload.mois);
    await notifier({
      userIds: await destinatairesClient(upload.dossier_id),
      titre: `Bulletins de ${libelle} retirés`,
      corps: "Le dépôt a été supprimé. Ces bulletins ne sont plus disponibles.",
      lien: "/client/bulletins",
      email: false,
    });
    if (comptes.length > 0) {
      await notifier({
        userIds: comptes,
        titre: `Bulletin de ${libelle} retiré`,
        corps: "Ce bulletin n'est plus disponible dans votre espace.",
        lien: "/salarie/bulletins",
        email: false,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
