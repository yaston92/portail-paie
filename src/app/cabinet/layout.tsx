import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { ROLES_CABINET } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import {
  getCabinetActif,
  getCabinetsMembre,
  peutAdminCabinet,
} from "@/lib/cabinet";
import { listerEspaces } from "@/lib/espaces";
import { AutresEspaces } from "@/components/autres-espaces";
import { AppShell, type NavItem } from "@/components/app-shell";
import { compterATraiter } from "@/lib/notifications-compte";
import { CabinetSwitcher } from "@/components/cabinet-switcher";

export default async function CabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(ROLES_CABINET);
  if (profile.email_confirme === false) redirect("/verifier-email");

  const supabase = await createClient();
  const [count, cabinets, cabinet] = await Promise.all([
    compterATraiter(supabase, profile.id),
    getCabinetsMembre(profile.id),
    getCabinetActif(),
    listerEspaces(profile).catch(() => []),
  ]);
  if (!cabinet && profile.role !== "directeur") redirect("/login");

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
      <AutresEspaces />
      {children}
    </AppShell>
  );
}
