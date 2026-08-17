import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { moisLabel, moisVersParam } from "@/lib/format";
import {
  Card,
  CardBody,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import type { Bulletin } from "@/lib/types";

export default async function ClientBulletinsPage() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("bulletins")
    .select("id, mois")
    .eq("dossier_id", profile.dossier_id!)
    .order("mois", { ascending: false });

  const counts = new Map<string, number>();
  for (const b of (data ?? []) as Pick<Bulletin, "id" | "mois">[]) {
    counts.set(b.mois, (counts.get(b.mois) ?? 0) + 1);
  }
  const moisListe = [...counts.entries()];

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Bulletins de paie"
        sousTitre="Choisissez un mois pour consulter et télécharger les bulletins."
      />
      {moisListe.length === 0 ? (
        <EmptyState message="Aucun bulletin publié pour le moment." />
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-gray-100">
              {moisListe.map(([mois, nb]) => (
                <li key={mois}>
                  <Link
                    href={`/client/bulletins/${moisVersParam(mois)}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <span>
                      <span className="font-medium text-gray-900">
                        {moisLabel(mois)}
                      </span>
                      <span className="text-sm text-gray-500 ml-2">
                        {nb} bulletin{nb > 1 ? "s" : ""}
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
  );
}
