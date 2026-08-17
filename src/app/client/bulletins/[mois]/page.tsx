import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { moisDepuisParam, moisLabel } from "@/lib/format";
import {
  Card,
  CardBody,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import type { Bulletin } from "@/lib/types";

export default async function ClientBulletinsMoisPage({
  params,
}: {
  params: Promise<{ mois: string }>;
}) {
  const profile = await requireRole(["client"]);
  const { mois: moisParam } = await params;
  const mois = moisDepuisParam(moisParam);
  if (!mois) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("bulletins")
    .select("*")
    .eq("dossier_id", profile.dossier_id!)
    .eq("mois", mois)
    .order("nom_fichier");
  const bulletins = (data ?? []) as Bulletin[];

  return (
    <div className="space-y-6">
      <PageHeader
        titre={moisLabel(mois)}
        sousTitre="Téléchargez les bulletins à l'unité ou l'archive ZIP du mois."
        actions={
          <Link
            href="/client/bulletins"
            className="text-sm text-blue-700 hover:underline"
          >
            ← Tous les mois
          </Link>
        }
      />
      {bulletins.length === 0 ? (
        <EmptyState message="Aucun bulletin pour ce mois." />
      ) : (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">
                {bulletins.length} bulletin
                {bulletins.length > 1 ? "s" : ""}
              </h2>
              <a
                href={`/api/bulletins/zip?dossier=${profile.dossier_id}&mois=${mois}`}
                className="text-sm text-blue-700 hover:underline"
              >
                Tout télécharger (ZIP)
              </a>
            </div>
            <ul className="divide-y divide-gray-100 text-sm">
              {bulletins.map((b) => (
                <li
                  key={b.id}
                  className="py-2 flex items-center justify-between gap-3"
                >
                  <span>{b.nom_fichier}</span>
                  <a
                    href={`/api/bulletins/${b.id}/telecharger`}
                    className="text-blue-700 hover:underline whitespace-nowrap"
                  >
                    Télécharger
                  </a>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
