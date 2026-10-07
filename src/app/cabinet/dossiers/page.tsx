import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  peutAdminCabinet,
  requireCabinetContext,
} from "@/lib/cabinet";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import type { Dossier, Profile } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function DossiersPage() {
  const ctx = await requireCabinetContext();
  if (!ctx.cabinet) redirect("/cabinet/cabinets");
  const { profile, cabinet } = ctx;
  const supabase = await createClient();
  const estAdmin = peutAdminCabinet(profile, cabinet);

  const [{ data: dossiers }, { data: membres }] = await Promise.all([
    supabase
      .from("dossiers")
      .select("*")
      .eq("cabinet_id", cabinet.id)
      .order("sigle"),
    supabase
      .from("cabinet_membres")
      .select("profile:profiles (id, nom, prenom)")
      .eq("cabinet_id", cabinet.id),
  ]);

  const collabParId = new Map<string, string>();
  for (const row of membres ?? []) {
    const p = (row as unknown as { profile?: Pick<Profile, "id" | "nom" | "prenom"> | null })
      .profile;
    if (p) collabParId.set(p.id, `${p.prenom} ${p.nom}`.trim());
  }

  const liste = (dossiers ?? []) as Dossier[];
  const { data: liens } = liste.length
    ? await supabase
        .from("dossier_collaborateurs")
        .select("dossier_id, profile_id")
        .in(
          "dossier_id",
          liste.map((d) => d.id)
        )
    : { data: [] as { dossier_id: string; profile_id: string }[] };
  const nomsParDossier = new Map<string, string[]>();
  for (const lien of (liens ?? []) as { dossier_id: string; profile_id: string }[]) {
    const nom = collabParId.get(lien.profile_id);
    if (!nom) continue;
    const deja = nomsParDossier.get(lien.dossier_id) ?? [];
    if (!deja.includes(nom)) deja.push(nom);
    nomsParDossier.set(lien.dossier_id, deja);
  }

  return (
    <div>
      <PageHeader
        titre="Dossiers clients"
        sousTitre={`${liste.length} dossier${liste.length > 1 ? "s" : ""}`}
        actions={
          estAdmin && (
            <ButtonLink href="/cabinet/dossiers/nouveau">
              Nouveau dossier
            </ButtonLink>
          )
        }
      />
      {liste.length === 0 ? (
        <EmptyState message="Aucun dossier pour le moment." />
      ) : (
        <div className="space-y-3">
          {liste.map((d) => (
            <Link key={d.id} href={`/cabinet/dossiers/${d.id}`} className="block">
              <Card className="transition-colors hover:border-blue-300 hover:bg-blue-50/40">
                <CardBody className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-base">
                        {d.sigle}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5 truncate">
                        {d.raison_sociale}
                      </p>
                      {(() => {
                        const noms = nomsParDossier.get(d.id) ?? [];
                        if (noms.length === 0 && d.collaborateur_id) {
                          const seul = collabParId.get(d.collaborateur_id);
                          if (seul) noms.push(seul);
                        }
                        return noms.length > 0 ? (
                          <p className="text-xs text-gray-400 mt-2">{noms.join(", ")}</p>
                        ) : null;
                      })()}
                    </div>
                    {d.archive ? (
                      <Badge variant="gray">Archivé</Badge>
                    ) : (
                      <Badge variant="green">Actif</Badge>
                    )}
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
