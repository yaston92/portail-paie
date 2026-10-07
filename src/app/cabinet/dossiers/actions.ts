"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getCabinetActif, peutAdminCabinet, requireCabinetContext } from "@/lib/cabinet";

function lireSiret(formData: FormData): { siret: string | null } | { error: string } {
  const brut = ((formData.get("siret") as string) || "").replace(/\s/g, "");
  if (!brut) return { siret: null };
  if (!/^\d{14}$/.test(brut)) {
    return { error: "Le SIRET doit contenir 14 chiffres." };
  }
  return { siret: brut };
}

function lireConvention(formData: FormData): string | null {
  const v = ((formData.get("convention_collective") as string) || "").trim();
  return v || null;
}

function lireCollaborateurIds(formData: FormData): string[] {
  const bruts = formData.getAll("collaborateur_ids").map((v) => String(v).trim());
  return [...new Set(bruts.filter((id) => id.length > 0))];
}

async function enregistrerCollaborateurs(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  dossierId: string,
  ids: string[]
) {
  await supabase.from("dossier_collaborateurs").delete().eq("dossier_id", dossierId);
  if (ids.length === 0) return;
  await supabase.from("dossier_collaborateurs").insert(
    ids.map((profile_id) => ({ dossier_id: dossierId, profile_id }))
  );
}

/** Création d'un dossier client (admin du cabinet actif). */
export async function creerDossier(formData: FormData) {
  const { profile, cabinet } = await requireCabinetContext();
  if (!cabinet || !peutAdminCabinet(profile, cabinet)) {
    redirect("/cabinet/dossiers?erreur=Non%20autorisé");
  }
  const supabase = await createClient();
  const siret = lireSiret(formData);
  if ("error" in siret) return { error: siret.error };
  const collaborateurs = lireCollaborateurIds(formData);

  const { data, error } = await supabase
    .from("dossiers")
    .insert({
      cabinet_id: cabinet.id,
      sigle: (formData.get("sigle") as string).trim().toUpperCase(),
      raison_sociale: (formData.get("raison_sociale") as string).trim(),
      email: (formData.get("email") as string) || null,
      telephone: (formData.get("telephone") as string) || null,
      siret: siret.siret,
      convention_collective: lireConvention(formData),
      collaborateur_id: collaborateurs[0] ?? null,
    })
    .select("id, sigle")
    .single();

  if (error || !data) {
    return {
      error: error?.message.toLowerCase().includes("duplicate")
        ? "Ce sigle existe déjà dans ce cabinet."
        : "Échec de la création du dossier.",
    };
  }

  await enregistrerCollaborateurs(supabase, data.id, collaborateurs);

  revalidatePath("/cabinet/dossiers");
  return { ok: true as const, id: data.id, sigle: data.sigle };
}

/** Modification d'un dossier (admin du cabinet du dossier). */
export async function modifierDossier(
  id: string,
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  const profile = await getProfile();
  const cabinet = await getCabinetActif();
  if (!profile || !cabinet || !peutAdminCabinet(profile, cabinet)) {
    return { error: "Non autorisé" };
  }
  const supabase = await createClient();
  const siret = lireSiret(formData);
  if ("error" in siret) return { error: siret.error };
  const collaborateurs = lireCollaborateurIds(formData);

  const { error } = await supabase
    .from("dossiers")
    .update({
      sigle: (formData.get("sigle") as string).trim().toUpperCase(),
      raison_sociale: (formData.get("raison_sociale") as string).trim(),
      email: (formData.get("email") as string) || null,
      telephone: (formData.get("telephone") as string) || null,
      siret: siret.siret,
      convention_collective: lireConvention(formData),
      collaborateur_id: collaborateurs[0] ?? null,
      archive: formData.get("archive") === "on",
    })
    .eq("id", id)
    .eq("cabinet_id", cabinet.id);

  if (error) {
    return {
      error: error.message.toLowerCase().includes("duplicate")
        ? "Ce sigle existe déjà dans ce cabinet."
        : "Échec de l'enregistrement.",
    };
  }

  await enregistrerCollaborateurs(supabase, id, collaborateurs);

  revalidatePath(`/cabinet/dossiers/${id}`);
  return { ok: true };
}
