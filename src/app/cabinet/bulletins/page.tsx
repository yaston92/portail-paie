import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCabinetActif } from "@/lib/cabinet";
import { createClient } from "@/lib/supabase/server";
import { moisLabel, moisVersParam } from "@/lib/format";
import { BulletinsUploadForm } from "@/components/bulletins-upload-form";
import {
  Card,
  CardBody,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import type { BulletinUpload, Dossier } from "@/lib/types";

export default async function CabinetBulletinsPage({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string }>;
}) {
  await requireRole(["admin_cabinet", "collaborateur"]);
  const sp = await searchParams;
  const cabinet = await getCabinetActif();
  if (!cabinet) redirect("/cabinet/cabinets");

  const supabase = await createClient();

  const [{ data: dossiers }, { data: uploads }] = await Promise.all([
    supabase
      .from("dossiers")
      .select("id, sigle, raison_sociale")
      .eq("archive", false)
      .eq("cabinet_id", cabinet.id)
      .order("sigle"),
    supabase
      .from("bulletin_uploads")
      .select("id, mois, dossier_id, dossiers!inner(cabinet_id)")
      .eq("dossiers.cabinet_id", cabinet.id)
      .order("mois", { ascending: false }),
  ]);

  const listeDossiers = (dossiers ?? []) as Pick<
    Dossier,
    "id" | "sigle" | "raison_sociale"
  >[];
  const idsDossiers = new Set(listeDossiers.map((d) => d.id));

  const listeUploads = ((uploads ?? []) as Pick<
    BulletinUpload,
    "id" | "mois" | "dossier_id"
  >[]).filter(
    (u) =>
      idsDossiers.has(u.dossier_id) &&
      (!sp.dossier || u.dossier_id === sp.dossier)
  );

  const counts = new Map<string, number>();
  for (const u of listeUploads) {
    counts.set(u.mois, (counts.get(u.mois) ?? 0) + 1);
  }
  const moisListe = [...counts.entries()];

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Bulletins de paie"
        sousTitre="Déposez le PDF global d'un dossier, puis consultez les mois publiés."
      />

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3">Nouveau dépôt</h2>
          <BulletinsUploadForm dossiers={listeDossiers} />
        </CardBody>
      </Card>

      <div>
        <h2 className="font-semibold mb-3">Par mois</h2>
        {moisListe.length === 0 ? (
          <EmptyState message="Aucun dépôt de bulletins pour le moment." />
        ) : (
          <Card>
            <CardBody className="p-0">
              <ul className="divide-y divide-gray-100">
                {moisListe.map(([mois, nb]) => (
                  <li key={mois}>
                    <Link
                      href={`/cabinet/bulletins/mois/${moisVersParam(mois)}${
                        sp.dossier ? `?dossier=${sp.dossier}` : ""
                      }`}
                      className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <span>
                        <span className="font-medium text-gray-900">
                          {moisLabel(mois)}
                        </span>
                        <span className="text-sm text-gray-500 ml-2">
                          {nb} dépôt{nb > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span className="text-gray-400">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
