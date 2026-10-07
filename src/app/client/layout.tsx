import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, type NavItem } from "@/components/app-shell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["client"]);
  if (profile.doit_changer_mot_de_passe) redirect("/changer-mot-de-passe");

  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("lu", false);

  const items: NavItem[] = [
    { href: "/client", label: "Accueil" },
    { href: "/client/salaries", label: "Salariés" },
    { href: "/client/planning", label: "Planning" },
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
      {children}
    </AppShell>
  );
}
