import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  peutAdminCabinet,
  requireCabinetContext,
} from "@/lib/cabinet";
import { FormRoleMembre } from "@/components/changer-role-membre";
import { labelRole, roleEffectif } from "@/lib/roles-cabinet";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui";
import type { Profile } from "@/lib/types";

export default async function EquipeMembrePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, cabinet } = await requireCabinetContext();
  if (!cabinet || !peutAdminCabinet(profile, cabinet)) {
    redirect("/cabinet");
  }

  const supabase = await createClient();
  const [{ data: membreRow }, { data: dossiers }, { data: liens }] =
    await Promise.all([
      supabase
        .from("cabinet_membres")
        .select(
          "role_membre, profile:profiles (id, nom, prenom, email, role, telephone)"
        )
        .eq("cabinet_id", cabinet.id)
        .eq("profile_id", id)
        .maybeSingle(),
      supabase
        .from("dossiers")
        .select("id")
        .eq("cabinet_id", cabinet.id)
        .eq("collaborateur_id", id),
      supabase
        .from("dossier_collaborateurs")
        .select("dossier_id")
        .eq("profile_id", id),
    ]);

  if (!membreRow) notFound();

  const raw = (membreRow as unknown as { profile?: Profile | Profile[] | null })
    .profile;
  const m = Array.isArray(raw) ? raw[0] : raw;
  if (!m) notFound();

  const roleMembre = (membreRow as { role_membre: string }).role_membre;
  const role = roleEffectif(m.role, roleMembre);
  const nbDossiers = new Set([
    ...(dossiers ?? []).map((d) => d.id as string),
    ...((liens ?? []) as { dossier_id: string }[]).map((l) => l.dossier_id),
  ]).size;

  return (
    <div className="space-y-6 max-w-lg">
      <PageHeader
        titre={`${m.prenom} ${m.nom}`.trim() || m.email}
        sousTitre={m.email}
        actions={
          <Link
            href="/cabinet/equipe"
            className="text-sm text-blue-700 hover:underline"
          >
            Retour à l&apos;équipe
          </Link>
        }
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Rôle actuel</span>
            <Badge variant={role === "collaborateur" ? "blue" : "violet"}>
              {labelRole(role)}
            </Badge>
          </div>
          <p className="text-sm text-gray-600">
            {nbDossiers} dossier{nbDossiers > 1 ? "s" : ""} en portefeuille
          </p>
          {m.telephone && (
            <p className="text-sm text-gray-600">Tél. {m.telephone}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3">Modifier le rôle</h2>
          <FormRoleMembre
            profileId={m.id}
            role={m.role}
            roleMembre={roleMembre}
            cabinetId={cabinet.id}
            acteurRole={profile.role}
            acteurId={profile.id}
          />
        </CardBody>
      </Card>
    </div>
  );
}
