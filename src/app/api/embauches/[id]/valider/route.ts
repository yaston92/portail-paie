import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { chiffrer } from "@/lib/crypto";
import { journaliser } from "@/lib/audit";
import { destinatairesClient, notifier } from "@/lib/notify";
import type { Embauche } from "@/lib/types";

/**
 * Validation d'une embauche par le cabinet :
 * crée automatiquement la fiche salarié dans la liste du client,
 * déplace le NIR vers le stockage chiffré et rattache les pièces au salarié.
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

  // RLS : l'embauche n'est visible que si le dossier est accessible
  const supabase = await createClient();
  const { data } = await supabase
    .from("embauches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Embauche inaccessible" }, { status: 403 });
  }
  const embauche = data as Embauche;
  if (embauche.statut === "valide") {
    return NextResponse.json({ error: "Embauche déjà validée." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: salarie, error } = await admin
    .from("salaries")
    .insert({
      dossier_id: embauche.dossier_id,
      nom: embauche.nom,
      prenom: embauche.prenom,
      date_entree: embauche.date_debut,
      type_contrat: embauche.type_contrat,
      cdd_duree: embauche.cdd_duree,
      duree_hebdo: embauche.duree_hebdo,
      poste: embauche.poste,
    })
    .select("id")
    .single();
  if (error || !salarie) {
    return NextResponse.json({ error: "Échec de création du salarié." }, { status: 500 });
  }

  if (embauche.nir) {
    await admin.from("salaries_sensibles").insert({
      salarie_id: salarie.id,
      nir_chiffre: chiffrer(embauche.nir.replace(/[\s.]/g, "")),
    });
  }

  // Rattache les pièces au salarié (documents sensibles, soumis à rétention)
  const pieces: { type_document: string; chemin: string }[] = [
    { type_document: "piece_identite_recto", chemin: embauche.piece_identite_recto_chemin },
    { type_document: "piece_identite_verso", chemin: embauche.piece_identite_verso_chemin },
  ];
  if (embauche.carte_vitale_chemin) {
    pieces.push({ type_document: "carte_vitale", chemin: embauche.carte_vitale_chemin });
  }
  await admin.from("salarie_documents").insert(
    pieces.map((p) => ({
      salarie_id: salarie.id,
      dossier_id: embauche.dossier_id,
      type_document: p.type_document,
      chemin: p.chemin,
      nom_fichier: p.chemin.split("/").pop() ?? p.type_document,
      sensible: true,
      uploaded_by: embauche.created_by,
    }))
  );

  await admin
    .from("embauches")
    .update({
      statut: "valide",
      salarie_id: salarie.id,
      validated_by: profile.id,
      nir: null, // le NIR ne reste pas en clair
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await journaliser({
    userId: profile.id,
    action: "embauche_validee",
    cibleType: "embauche",
    cibleId: id,
    dossierId: embauche.dossier_id,
    details: { salarie_id: salarie.id },
  });

  await notifier({
    userIds: await destinatairesClient(embauche.dossier_id),
    titre: "Embauche validée",
    corps: `L'embauche de ${embauche.nom} ${embauche.prenom} a été validée. La fiche salarié a été créée.`,
    lien: "/client/salaries",
  });

  return NextResponse.json({ ok: true, salarie_id: salarie.id });
}
