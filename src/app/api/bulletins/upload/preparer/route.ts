import { NextResponse } from "next/server";
import { cabinetPeutAccederDossier, getApiProfile } from "@/lib/auth";
import {
  TAILLE_MAX_PDF,
  cheminDepotBulletin,
  identifiantDepot,
} from "@/lib/depot-bulletin";
import { refuserSansDroit } from "@/lib/droits-serveur";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Prépare un dépôt sans faire passer le PDF par le serveur.
 * Le navigateur envoie ensuite le fichier directement au stockage.
 */
export async function POST(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const refus = await refuserSansDroit(profile, "bulletins");
  if (refus) return refus;

  const corps = (await request.json().catch(() => null)) as {
    dossier_id?: string;
    mois?: string;
    taille?: number;
  } | null;
  const dossierId = corps?.dossier_id ?? "";
  const mois = corps?.mois ?? "";
  const taille = Number(corps?.taille);
  if (!identifiantDepot(dossierId) || !/^\d{4}-\d{2}-01$/.test(mois)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  if (!Number.isFinite(taille) || taille < 5) {
    return NextResponse.json({ error: "Fichier PDF attendu." }, { status: 400 });
  }
  if (taille > TAILLE_MAX_PDF) {
    return NextResponse.json(
      { error: "Ce PDF dépasse 40 Mo. Réexportez-le depuis le logiciel de paie." },
      { status: 400 }
    );
  }
  if (!(await cabinetPeutAccederDossier(dossierId))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  const id = crypto.randomUUID();
  const chemin = cheminDepotBulletin(dossierId, id);
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("bulletins")
    .createSignedUploadUrl(chemin);
  if (error || !data?.token) {
    return NextResponse.json(
      { error: "Le dépôt n'a pas pu être préparé. Réessayez." },
      { status: 500 }
    );
  }

  return NextResponse.json({ id, chemin, token: data.token });
}
