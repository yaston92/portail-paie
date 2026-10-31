import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listerEspaces } from "@/lib/espaces";
import { createClient } from "@/lib/supabase/server";
import { AutresEspaces } from "@/components/autres-espaces";
import { AppShell, type NavItem } from "@/components/app-shell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["client"]);
  if (profile.doit_changer_mot_de_passe) redirect("/changer-mot-de-passe");

  const supabase = await createClient();
  const [{ count }, planning] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("lu", false),
    profile.dossier_id
      ? supabase
          .from("dossiers")
          .select("planning_actif")
          .eq("id", profile.dossier_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    listerEspaces(profile).catch(() => []),
  ]);
  const planningActif = !planning.error && planning.data?.planning_actif === true;

  const items: NavItem[] = [
    { href: "/client", label: "Accueil" },
    { href: "/client/salaries", label: "Salariés" },
    ...(planningActif ? [{ href: "/client/planning", label: "Planning" }] : []),
    { href: "/client/embauches", label: "Embauches" },
    { href: "/client/conges", label: "Congés" },
    { href: "/client/arrets-maladie", label: "Arrêts maladie" },
    { href: "/client/variables", label: "Variables de paie" },
    { href: "/client/bulletins", label: "Bulletins" },
    { href: "/client/attestations", label: "Attestations" },
    { href: "/client/parametres", label: "Paramètres" },
  ];

  return (
    <AppShell
      titre="ETIK Paie"
      nomUtilisateur={`${profile.prenom} ${profile.nom}`.trim() || profile.email}
      roleLabel="Employeur"
      items={items}
      notificationsNonLues={count ?? 0}
    >
      <AutresEspaces />
      {children}
    </AppShell>
  );
}
