import { requireRole } from "@/lib/auth";
import { listerEspaces } from "@/lib/espaces";
import { AutresEspaces } from "@/components/autres-espaces";
import { AppShell, type NavItem } from "@/components/app-shell";
import { compterATraiter } from "@/lib/notifications-compte";

export default async function SalarieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["salarie"]);

  const [count] = await Promise.all([
    compterATraiter(profile),
    listerEspaces(profile).catch(() => []),
  ]);

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
      <AutresEspaces />
      {children}
    </AppShell>
  );
}
