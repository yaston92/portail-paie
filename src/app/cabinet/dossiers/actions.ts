"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getCabinetActif, peutAdminCabinet, requireCabinetContext } from "@/lib/cabinet";

/** Création d'un dossier client (admin du cabinet actif). */
export async function creerDossier(formData: FormData) {
  const { profile, cabinet } = await requireCabinetContext();
  if (!cabinet || !peutAdminCabinet(profile, cabinet)) {
    redirect("/cabinet/dossiers?erreur=Non%20autorisé");
  }
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dossiers")
    .insert({
      cabinet_id: cabinet.id,
      sigle: (formData.get("sigle") as string).trim().toUpperCase(),
      raison_sociale: (formData.get("raison_sociale") as string).trim(),
      email: (formData.get("email") as string) || null,
      telephone: (formData.get("telephone") as string) || null,
      collaborateur_id: (formData.get("collaborateur_id") as string) || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/cabinet/dossiers/nouveau?erreur=${encodeURIComponent(
        error?.message.includes("duplicate")
          ? "Ce sigle existe déjà dans ce cabinet."
          : "Échec de la création du dossier."
      )}`
    );
  }
  redirect(`/cabinet/dossiers/${data.id}`);
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

  const { error } = await supabase
    .from("dossiers")
    .update({
      sigle: (formData.get("sigle") as string).trim().toUpperCase(),
      raison_sociale: (formData.get("raison_sociale") as string).trim(),
      email: (formData.get("email") as string) || null,
      telephone: (formData.get("telephone") as string) || null,
      collaborateur_id: (formData.get("collaborateur_id") as string) || null,
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

  revalidatePath(`/cabinet/dossiers/${id}`);
  return { ok: true };
}
