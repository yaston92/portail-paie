import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, type NavItem } from "@/components/app-shell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["client"]);

  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
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
