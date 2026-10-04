import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell, type NavItem } from "@/components/app-shell";

export default async function SalarieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["salarie"]);

  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("lu", false);

  const items: NavItem[] = [
    { href: "/salarie", label: "Accueil" },
    { href: "/salarie/bulletins", label: "Mes bulletins" },
    { href: "/salarie/parametres", label: "Paramètres" },
  ];

  return (
    <AppShell
      titre="ETIK Paie"
      nomUtilisateur={`${profile.prenom} ${profile.nom}`.trim() || profile.email}
      roleLabel="Salarié"
      items={items}
      notificationsNonLues={count ?? 0}
    >
      {children}
    </AppShell>
  );
}
