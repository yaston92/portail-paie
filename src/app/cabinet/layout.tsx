import { ROLES_CABINET } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import {
  peutAdminCabinet,
  requireCabinetContext,
} from "@/lib/cabinet";
import { AppShell, type NavItem } from "@/components/app-shell";
import { CabinetSwitcher } from "@/components/cabinet-switcher";

export default async function CabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, cabinet, cabinets } = await requireCabinetContext(
    ROLES_CABINET,
    { allowEmptyDirecteur: true }
  );

  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("lu", false);

  const estAdmin = cabinet
    ? peutAdminCabinet(profile, cabinet)
    : profile.role === "directeur";

  const estDirecteur = profile.role === "directeur";

  const items: NavItem[] = cabinet
    ? [
        { href: "/cabinet", label: "Tableau de bord" },
        ...(estDirecteur
          ? [{ href: "/cabinet/cabinets", label: "Cabinets" }]
          : []),
        { href: "/cabinet/dossiers", label: "Dossiers" },
        { href: "/cabinet/embauches", label: "Embauches" },
        { href: "/cabinet/arrets-maladie", label: "Arrêts maladie" },
        { href: "/cabinet/campagnes", label: "Campagnes" },
        { href: "/cabinet/bulletins", label: "Bulletins" },
      ]
    : estDirecteur
      ? [{ href: "/cabinet/cabinets", label: "Cabinets" }]
      : [];

  if (cabinet && estAdmin) {
    items.push({ href: "/cabinet/equipe", label: "Équipe" });
  }

  items.push({ href: "/cabinet/compte", label: "Compte" });

  const roleLabel = estDirecteur
    ? "Directeur"
    : cabinet?.role_membre === "admin" || profile.role === "admin_cabinet"
      ? "Administrateur"
      : "Collaborateur";

  return (
    <AppShell
      titre="ETIK Paie"
      nomUtilisateur={`${profile.prenom} ${profile.nom}`.trim() || profile.email}
      roleLabel={roleLabel}
      headerExtra={
        <CabinetSwitcher
          cabinets={cabinets}
          actifId={cabinet?.id ?? null}
          peutGerer={estDirecteur}
        />
      }
      items={items}
      notificationsNonLues={count ?? 0}
      compteHref="/cabinet/compte"
    >
      {children}
    </AppShell>
  );
}
