import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, moisDepuisParam, moisLabel } from "@/lib/format";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui";
import type { Bulletin } from "@/lib/types";

export default async function SalarieBulletinsMoisPage({
  params,
}: {
  params: Promise<{ mois: string }>;
}) {
  const profile = await requireRole(["salarie"]);
  const { mois: moisParam } = await params;
  const mois = moisDepuisParam(moisParam);
  if (!mois) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("bulletins")
    .select("*")
    .eq("salarie_id", profile.salarie_id!)
    .eq("mois", mois)
    .order("published_at", { ascending: false });
  const bulletins = (data ?? []) as Bulletin[];

  return (
    <div className="space-y-6">
      <PageHeader
        titre={moisLabel(mois)}
        sousTitre="Téléchargez votre bulletin de paie."
        actions={
          <Link
            href="/salarie/bulletins"
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
          <CardBody className="p-0">
            <ul className="divide-y divide-gray-100 text-sm">
              {bulletins.map((b) => (
                <li
                  key={b.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3"
                >
                  <span>
                    <span className="font-medium">{b.nom_fichier}</span>
                    <span className="text-gray-400 ml-2 text-xs">
                      publié le {formatDate(b.published_at.slice(0, 10))}
                    </span>
                  </span>
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
