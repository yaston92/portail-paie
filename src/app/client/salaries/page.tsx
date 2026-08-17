import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { estPresentSurMois, formatDate, moisCourant } from "@/lib/format";
import { labelMotifSortie } from "@/lib/sortie";
import {
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import type { Salarie } from "@/lib/types";

export default async function ClientSalariesPage() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("salaries")
    .select("*")
    .eq("dossier_id", profile.dossier_id!)
    .order("nom");

  const tous = (data ?? []) as Salarie[];
  const mois = moisCourant();
  const actifs = tous.filter((s) => estPresentSurMois(s, mois));
  const archives = tous.filter((s) => !estPresentSurMois(s, mois));

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Vos salariés"
        sousTitre={`${actifs.length} salarié(s) actif(s). Cliquez sur un nom pour gérer l'accès, les horaires ou une sortie.`}
      />
      {actifs.length === 0 ? (
        <EmptyState message="Aucun salarié actif. Utilisez le module Embauches pour déclarer une embauche." />
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-gray-100">
              {actifs.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/client/salaries/${s.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">
                      {s.nom} {s.prenom}
                    </span>
                    <span className="text-gray-400 text-sm" aria-hidden>
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {archives.length > 0 && (
        <Card>
          <CardBody>
            <details>
              <summary className="font-semibold cursor-pointer">
                Anciens salariés ({archives.length})
              </summary>
              <div className="mt-3">
                <TableWrap>
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Nom</Th>
                      <Th>Sortie</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {archives.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <Td>
                          <Link
                            href={`/client/salaries/${s.id}`}
                            className="font-medium text-blue-700 hover:underline"
                          >
                            {s.nom} {s.prenom}
                          </Link>
                        </Td>
                        <Td>
                          {formatDate(s.date_sortie)}
                          {s.motif_sortie
                            ? ` : ${labelMotifSortie(s.motif_sortie)}`
                            : ""}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            </details>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
