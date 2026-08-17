import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  peutAdminCabinet,
  requireCabinetContext,
} from "@/lib/cabinet";
import { labelRole, roleEffectif } from "@/lib/roles-cabinet";
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
  const [{ data: membresRows }, { data: dossiers }] = await Promise.all([
    supabase
      .from("cabinet_membres")
      .select(
        "role_membre, profile:profiles (id, nom, prenom, email, role, created_at)"
      )
      .eq("cabinet_id", cabinet.id),
    supabase
      .from("dossiers")
      .select("id, collaborateur_id")
      .eq("cabinet_id", cabinet.id),
  ]);

  const nbDossiersParCollab = new Map<string, number>();
  for (const d of dossiers ?? []) {
    if (d.collaborateur_id) {
      nbDossiersParCollab.set(
        d.collaborateur_id,
        (nbDossiersParCollab.get(d.collaborateur_id) ?? 0) + 1
      );
    }
  }

  type Ligne = {
    role_membre: string;
    profile: Profile | null;
  };

  const lignes: Ligne[] = (membresRows ?? [])
    .map((row) => {
      const p = (row as unknown as { profile?: Profile | Profile[] | null })
        .profile;
      return {
        role_membre: (row as unknown as { role_membre: string }).role_membre,
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
          {lignes.map(({ profile: m, role_membre }) => {
            const role = roleEffectif(m!.role, role_membre);
            const nb = nbDossiersParCollab.get(m!.id) ?? 0;
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
