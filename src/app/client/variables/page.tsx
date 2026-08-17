import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, moisLabel } from "@/lib/format";
import {
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { CampagneStatutBadge } from "@/components/campagne-badge";
import type { Campagne } from "@/lib/types";

export default async function ClientVariablesPage() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("campagnes")
    .select("*")
    .eq("dossier_id", profile.dossier_id!)
    .order("mois", { ascending: false });
  const campagnes = (data ?? []) as Campagne[];

  return (
    <div>
      <PageHeader
        titre="Variables de paie"
        sousTitre="Chaque mois, transmettez vos variables avant la date limite."
      />
      {campagnes.length === 0 ? (
        <EmptyState message="Aucune campagne pour le moment. Le cabinet ouvrira la campagne du mois prochain." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              <Th>Mois</Th>
              <Th>Date limite</Th>
              <Th>Statut</Th>
              <Th>Récapitulatif</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campagnes.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <Td>
                  <Link
                    href={`/client/variables/${c.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {moisLabel(c.mois)}
                  </Link>
                </Td>
                <Td>{formatDate(c.date_limite)}</Td>
                <Td>
                  <CampagneStatutBadge campagne={c} />
                </Td>
                <Td>
                  {c.recap_chemin ? (
                    <a
                      href={`/api/campagnes/${c.id}/recap`}
                      className="text-blue-700 hover:underline"
                    >
                      Télécharger le PDF
                    </a>
                  ) : (
                    "-"
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
