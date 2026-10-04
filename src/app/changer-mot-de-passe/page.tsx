import { redirect } from "next/navigation";
import { getProfile, roleHome } from "@/lib/auth";
import { ChangerMotDePasseForm } from "@/components/changer-mot-de-passe-form";

export default async function ChangerMotDePassePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.doit_changer_mot_de_passe) redirect(roleHome(profile.role));
  return <ChangerMotDePasseForm />;
}
