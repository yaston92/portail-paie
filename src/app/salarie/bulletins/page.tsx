import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { moisLabel, moisVersParam } from "@/lib/format";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui";
import type { Bulletin } from "@/lib/types";

export default async function SalarieBulletinsPage() {
  const profile = await requireRole(["salarie"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("bulletins")
    .select("id, mois")
    .eq("salarie_id", profile.salarie_id!)
    .order("mois", { ascending: false });

  const counts = new Map<string, number>();
  for (const b of (data ?? []) as Pick<Bulletin, "id" | "mois">[]) {
    counts.set(b.mois, (counts.get(b.mois) ?? 0) + 1);
  }
  const moisListe = [...counts.entries()];

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Mes bulletins de paie"
        sousTitre="Choisissez un mois pour télécharger votre bulletin."
      />
      {moisListe.length === 0 ? (
        <EmptyState message="Aucun bulletin disponible pour le moment." />
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-gray-100">
              {moisListe.map(([mois, nb]) => (
                <li key={mois}>
                  <Link
                    href={`/salarie/bulletins/${moisVersParam(mois)}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <span>
                      <span className="font-medium text-gray-900">
                        {moisLabel(mois)}
                      </span>
                      {nb > 1 && (
                        <span className="text-sm text-gray-500 ml-2">
                          {nb} fichiers
                        </span>
                      )}
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
  );
}
