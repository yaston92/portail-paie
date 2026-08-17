import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";

/** Détache les FK vers le profil, puis supprime le compte Auth. */
export async function supprimerCompteUtilisateur(userId: string): Promise<void> {
  const admin = createAdminClient();

  await journaliser({
    userId,
    action: "compte_supprime",
    cibleType: "profile",
    cibleId: userId,
  });

  await admin.from("salaries").update({ profile_id: null }).eq("profile_id", userId);
  await admin.from("dossiers").update({ collaborateur_id: null }).eq("collaborateur_id", userId);
  await admin.from("embauches").update({ created_by: null }).eq("created_by", userId);
  await admin.from("embauches").update({ validated_by: null }).eq("validated_by", userId);
  await admin.from("bulletin_uploads").update({ created_by: null }).eq("created_by", userId);
  await admin.from("salarie_documents").update({ uploaded_by: null }).eq("uploaded_by", userId);
  await admin.from("demandes_conge").update({ decideur_id: null }).eq("decideur_id", userId);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (!error) return;

  const ghost = `deleted-${userId.replace(/-/g, "").slice(0, 16)}@deleted.invalid`;
  await admin
    .from("profiles")
    .update({
      nom: "Compte supprimé",
      prenom: "",
      email: ghost,
      telephone: null,
    })
    .eq("id", userId);
  await admin.auth.admin.updateUserById(userId, {
    email: ghost,
    password: `${crypto.randomUUID()}Aa1!`,
    ban_duration: "876000h",
  });
}
