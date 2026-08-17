import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { chiffrer } from "@/lib/crypto";
import { journaliser } from "@/lib/audit";
import { nirValide } from "@/lib/format";

const schema = z.object({
  dossier_id: z.string().uuid(),
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
});

/** Ajout manuel d'un salarié par le cabinet (embauches hors appli). */
export async function POST(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const d = body.data;

  if (!(await cabinetPeutAccederDossier(d.dossier_id))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }
  if (d.nir && !nirValide(d.nir)) {
    return NextResponse.json(
      { error: "Numéro de sécurité sociale invalide (13 ou 15 chiffres)." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const typeContrat =
    d.type_contrat === "cdi" || d.type_contrat === "cdd" ? d.type_contrat : null;

  const { data: salarie, error } = await admin
    .from("salaries")
    .insert({
      dossier_id: d.dossier_id,
      nom: d.nom.toUpperCase(),
      prenom: d.prenom,
      matricule: d.matricule || null,
      email: d.email || null,
      date_entree: d.date_entree || null,
      type_contrat: typeContrat,
      cdd_duree: typeContrat === "cdd" ? d.cdd_duree || null : null,
      duree_hebdo: d.duree_hebdo ?? null,
      poste: d.poste || null,
    })
    .select("id")
    .single();

  if (error || !salarie) {
    return NextResponse.json(
      { error: "Échec de création : " + (error?.message ?? "inconnu") },
      { status: 500 }
    );
  }

  if (d.nir) {
    await admin.from("salaries_sensibles").insert({
      salarie_id: salarie.id,
      nir_chiffre: chiffrer(d.nir.replace(/[\s.]/g, "")),
    });
  }

  await journaliser({
    userId: profile.id,
    action: "creation_salarie",
    cibleType: "salarie",
    cibleId: salarie.id,
    dossierId: d.dossier_id,
  });

  return NextResponse.json({ ok: true, id: salarie.id });
}
