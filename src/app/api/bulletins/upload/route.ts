import { after, NextResponse } from "next/server";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { refuserSansDroit } from "@/lib/droits-serveur";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyserBulletinDepose } from "@/lib/analyser-bulletins";
import { notifier } from "@/lib/notify";
import { uploaderFichier } from "@/lib/storage";
import { estPdfValide, normaliserPdf } from "@/lib/pdf-bulletins";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Upload du PDF global des paies d'un dossier (cabinet).
 * Le fichier est enregistré tout de suite. Le découpage continue ensuite,
 * et une notification prévient quand il est prêt.
 */
export async function POST(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const refus = await refuserSansDroit(profile, "bulletins");
  if (refus) return refus;

  const form = await request.formData();
  const dossierId = (form.get("dossier_id") as string) ?? "";
  const mois = (form.get("mois") as string) ?? "";
  const fichier = form.get("fichier");

  if (!dossierId || !/^\d{4}-\d{2}-01$/.test(mois) || !(fichier instanceof File)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  if (!fichier.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Fichier PDF attendu." }, { status: 400 });
  }
  if (!(await cabinetPeutAccederDossier(dossierId))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  const brut = Buffer.from(await fichier.arrayBuffer());
  const contenu = normaliserPdf(brut);
  if (!estPdfValide(contenu)) {
    return NextResponse.json(
      {
        error:
          "Ce fichier n'est pas un PDF valide. Réexportez-le depuis le logiciel de paie, sans le passer par un aperçu ou une photo.",
      },
      { status: 400 }
    );
  }
  console.info("[bulletins/upload] reçu", {
    name: fichier.name,
    type: fichier.type,
    size: contenu.length,
    magic: contenu.subarray(0, 8).toString("latin1"),
  });

  const admin = createAdminClient();
  const { data: upload, error } = await admin
    .from("bulletin_uploads")
    .insert({
      dossier_id: dossierId,
      mois,
      chemin: "",
      nb_pages: null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !upload) {
    return NextResponse.json({ error: "Échec de l'enregistrement." }, { status: 500 });
  }

  const chemin = `dossiers/${dossierId}/uploads/${upload.id}.pdf`;
  await uploaderFichier("bulletins", chemin, contenu, "application/pdf");
  await admin.from("bulletin_uploads").update({ chemin }).eq("id", upload.id);

  const userId = profile.id;
  after(async () => {
    try {
      await analyserBulletinDepose({
        admin,
        uploadId: upload.id,
        dossierId,
        mois,
        userId,
        contenu,
      });
    } catch (e) {
      console.error("[bulletins/upload] découpage:", e);
      await admin.from("bulletin_uploads").update({ nb_pages: 0 }).eq("id", upload.id);
      await notifier({
        userIds: [userId],
        titre: "Découpage des bulletins impossible",
        corps: "Le PDF a été reçu, mais le découpage n'a pas abouti. Déposez-le à nouveau.",
        lien: "/cabinet/bulletins",
        email: false,
      });
    }
  });

  return NextResponse.json({ ok: true, id: upload.id, en_cours: true });
}
