import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  peutAdminCabinet,
  requireCabinetContext,
} from "@/lib/cabinet";
import { labelRole, roleEffectif } from "@/lib/roles-cabinet";
import { droitsComplets, lireDroits } from "@/lib/droits";
import { InviterUtilisateur } from "@/components/inviter-utilisateur";
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import type { Profile } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function EquipePage() {
  const { profile, cabinet } = await requireCabinetContext();
  if (!cabinet || !peutAdminCabinet(profile, cabinet)) {
    redirect("/cabinet");
  }

  const supabase = await createClient();
  let membresQuery = await supabase
    .from("cabinet_membres")
    .select(
      "role_membre, droits, profile:profiles (id, nom, prenom, email, role, created_at)"
    )
    .eq("cabinet_id", cabinet.id);
  if (membresQuery.error) {
    const sansDroits = await supabase
      .from("cabinet_membres")
      .select(
        "role_membre, profile:profiles (id, nom, prenom, email, role, created_at)"
      )
      .eq("cabinet_id", cabinet.id);
    membresQuery = sansDroits as typeof membresQuery;
  }
  const membresRows = membresQuery.data;
  const [{ data: dossiers }, { data: liens }] = await Promise.all([
      supabase
        .from("dossiers")
        .select("id, collaborateur_id")
        .eq("cabinet_id", cabinet.id),
      supabase
        .from("dossier_collaborateurs")
        .select("dossier_id, profile_id, dossiers!inner(cabinet_id)")
        .eq("dossiers.cabinet_id", cabinet.id),
    ]);
  const dossiersParCollab = new Map<string, Set<string>>();
  function ajouter(profileId: string | null, dossierId: string) {
    if (!profileId) return;
    const set = dossiersParCollab.get(profileId) ?? new Set<string>();
    set.add(dossierId);
    dossiersParCollab.set(profileId, set);
  }
  for (const d of dossiers ?? []) {
    ajouter(d.collaborateur_id as string | null, d.id as string);
  }
  for (const lien of (liens ?? []) as { dossier_id: string; profile_id: string }[]) {
    ajouter(lien.profile_id, lien.dossier_id);
  }
  const nbDossiersParCollab = new Map<string, number>();
  for (const [profileId, set] of dossiersParCollab) {
    nbDossiersParCollab.set(profileId, set.size);
  }

  type Ligne = {
    role_membre: string;
    droits: unknown;
    profile: Profile | null;
  };

  const lignes: Ligne[] = (membresRows ?? [])
    .map((row) => {
      const brut = row as unknown as {
        role_membre: string;
        droits?: unknown;
        profile?: Profile | Profile[] | null;
      };
      const p = brut.profile;
      return {
        role_membre: brut.role_membre,
        droits: brut.droits,
        profile: Array.isArray(p) ? p[0] ?? null : p ?? null,
      };
    })
    .filter((l) => l.profile)
    .sort((a, b) =>
      `${a.profile!.nom} ${a.profile!.prenom}`.localeCompare(
        `${b.profile!.nom} ${b.profile!.prenom}`,
        "fr"
      )
    );

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Équipe"
        sousTitre={`${lignes.length} membre${lignes.length > 1 ? "s" : ""}`}
      />

      {lignes.length === 0 ? (
        <EmptyState message="Aucun membre pour le moment." />
      ) : (
        <div className="space-y-3">
          {lignes.map(({ profile: m, role_membre, droits }) => {
            const role = roleEffectif(m!.role, role_membre);
            const nb = nbDossiersParCollab.get(m!.id) ?? 0;
            const restreint =
              role === "collaborateur" && !droitsComplets(lireDroits(droits));
            return (
              <Link
                key={m!.id}
                href={`/cabinet/equipe/${m!.id}`}
                className="block"
              >
                <Card className="transition-colors hover:border-blue-300 hover:bg-blue-50/40">
                  <CardBody className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">
                          {m!.prenom} {m!.nom}
                        </p>
                        <p className="text-sm text-gray-500 mt-0.5 truncate">
                          {m!.email}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          {nb} dossier{nb > 1 ? "s" : ""}
                          {restreint ? " · droits limités" : ""}
                        </p>
                      </div>
                      <Badge
                        variant={role === "collaborateur" ? "gray" : "blue"}
                      >
                        {labelRole(role)}
                      </Badge>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Card className="max-w-lg">
        <CardBody>
          <h2 className="font-semibold mb-1">Inviter un membre</h2>
          <p className="text-sm text-gray-500 mb-4">
            Envoi d&apos;un lien d&apos;activation par email.
          </p>
          <InviterUtilisateur
            role="choix_cabinet"
            cabinetId={cabinet.id}
            permettreDirecteur={profile.role === "directeur"}
          />
        </CardBody>
      </Card>
    </div>
  );
}
