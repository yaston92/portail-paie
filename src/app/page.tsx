import { redirect } from "next/navigation";
import { getProfile, roleHome } from "@/lib/auth";

export default async function Home() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.doit_changer_mot_de_passe) redirect("/changer-mot-de-passe");
  redirect(roleHome(profile.role));
}
