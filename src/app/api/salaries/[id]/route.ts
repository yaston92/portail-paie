import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { chiffrer } from "@/lib/crypto";
import { journaliser } from "@/lib/audit";
import { nirValide } from "@/lib/format";
import { supprimerFichiers } from "@/lib/storage";

const schema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  matricule: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  nir: z.string().optional().or(z.literal("")),
  date_entree: z.string().optional().or(z.literal("")),
  type_contrat: z.enum(["cdi", "cdd"]).optional().or(z.literal("")),
  cdd_duree: z.string().optional().or(z.literal("")),
  duree_hebdo: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().positive().optional()
  ),
  poste: z.string().optional().or(z.literal("")),
  opposition_bulletin: z.boolean().optional(),
});

/** Modification d'un salarié par le cabinet. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id } = await params;
  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const d = body.data;

  const admin = createAdminClient();
  const { data: existant } = await admin
    .from("salaries")
    .select("id, dossier_id")
    .eq("id", id)
    .maybeSingle();
  if (!existant) {
    return NextResponse.json({ error: "Salarié introuvable" }, { status: 404 });
  }
  if (!(await cabinetPeutAccederDossier(existant.dossier_id))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }
  if (d.nir && !nirValide(d.nir)) {
    return NextResponse.json(
      { error: "Numéro de sécurité sociale invalide (13 ou 15 chiffres)." },
      { status: 400 }
    );
  }

  const typeContrat =
    d.type_contrat === "cdi" || d.type_contrat === "cdd" ? d.type_contrat : null;

  const { error } = await admin
    .from("salaries")
    .update({
      nom: d.nom.toUpperCase(),
      prenom: d.prenom,
      matricule: d.matricule || null,
      email: d.email || null,
      date_entree: d.date_entree || null,
      type_contrat: typeContrat,
      cdd_duree: typeContrat === "cdd" ? d.cdd_duree || null : null,
      duree_hebdo: d.duree_hebdo ?? null,
      poste: d.poste || null,
      ...(typeof d.opposition_bulletin === "boolean"
        ? { opposition_bulletin: d.opposition_bulletin }
        : {}),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Échec de la mise à jour : " + error.message },
      { status: 500 }
    );
  }

  if (d.nir) {
    const nirChiffre = chiffrer(d.nir.replace(/[\s.]/g, ""));
    const { data: sens } = await admin
      .from("salaries_sensibles")
      .select("salarie_id")
      .eq("salarie_id", id)
      .maybeSingle();
    if (sens) {
      await admin
        .from("salaries_sensibles")
        .update({ nir_chiffre: nirChiffre })
        .eq("salarie_id", id);
    } else {
      await admin.from("salaries_sensibles").insert({
        salarie_id: id,
        nir_chiffre: nirChiffre,
      });
    }
  }

  await journaliser({
    userId: profile.id,
    action: "modification_salarie",
    cibleType: "salarie",
    cibleId: id,
    dossierId: existant.dossier_id,
  });

  return NextResponse.json({ ok: true, id });
}

/** Suppression définitive d'un salarié (cabinet). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data: existant } = await admin
    .from("salaries")
    .select("id, dossier_id, nom, prenom")
    .eq("id", id)
    .maybeSingle();
  if (!existant) {
    return NextResponse.json({ error: "Salarié introuvable" }, { status: 404 });
  }
  if (!(await cabinetPeutAccederDossier(existant.dossier_id))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  const [{ data: docs }, { data: bulletins }] = await Promise.all([
    admin.from("salarie_documents").select("chemin").eq("salarie_id", id),
    admin.from("bulletins").select("chemin").eq("salarie_id", id),
  ]);

  const cheminsDocs = (docs ?? []).map((d) => d.chemin).filter(Boolean);
  const cheminsBulletins = (bulletins ?? []).map((b) => b.chemin).filter(Boolean);

  const { error } = await admin.from("salaries").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Échec de la suppression : " + error.message },
      { status: 500 }
    );
  }

  try {
    if (cheminsDocs.length) await supprimerFichiers("documents", cheminsDocs);
    if (cheminsBulletins.length) {
      await supprimerFichiers("bulletins", cheminsBulletins);
    }
  } catch (e) {
    console.error("[salaries DELETE] storage", e);
  }

  await journaliser({
    userId: profile.id,
    action: "suppression_salarie",
    cibleType: "salarie",
    cibleId: id,
    dossierId: existant.dossier_id,
    details: {
      nom: existant.nom,
      prenom: existant.prenom,
      nb_bulletins: cheminsBulletins.length,
      nb_documents: cheminsDocs.length,
    },
  });

  return NextResponse.json({
    ok: true,
    dossier_id: existant.dossier_id,
  });
}
