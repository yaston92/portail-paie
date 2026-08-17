import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { aujourdhuiParis } from "@/lib/demandes-conge";
import { formatDateCourte } from "@/lib/format";
import { ReclamerJustificatifArret } from "@/components/reclamer-justificatif-arret";
import {
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import type { ArretMaladie } from "@/lib/types";

type ArretLigne = ArretMaladie & {
  salaries?: { nom: string; prenom: string } | null;
  dossiers?: { sigle: string } | null;
};

function Tableau({ lignes }: { lignes: ArretLigne[] }) {
  return (
    <TableWrap>
      <thead className="bg-gray-50">
        <tr>
          <Th className="whitespace-nowrap">Dossier</Th>
          <Th className="whitespace-nowrap">Salarié</Th>
          <Th className="whitespace-nowrap">Début</Th>
          <Th className="whitespace-nowrap">Fin</Th>
          <Th className="whitespace-nowrap text-center">Jours</Th>
          <Th className="whitespace-nowrap">Déclaré le</Th>
          <Th className="whitespace-nowrap">Justificatif</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {lignes.map((a) => {
          const nom = a.salaries
            ? `${a.salaries.prenom} ${a.salaries.nom}`
            : "-";
          return (
            <tr key={a.id} className="hover:bg-gray-50">
              <Td className="font-semibold whitespace-nowrap align-middle">
                {a.dossiers?.sigle ?? "-"}
              </Td>
              <Td className="align-middle whitespace-nowrap">
                <Link
                  href={`/cabinet/salaries/${a.salarie_id}`}
                  className="font-medium text-blue-700 hover:underline"
                >
                  {nom}
                </Link>
              </Td>
              <Td className="whitespace-nowrap align-middle">
                {formatDateCourte(a.date_debut)}
              </Td>
              <Td className="whitespace-nowrap align-middle">
                {formatDateCourte(a.date_fin)}
              </Td>
              <Td className="whitespace-nowrap align-middle text-center">
                {Number(a.jours)}
              </Td>
              <Td className="whitespace-nowrap align-middle">
                {formatDateCourte(a.created_at.slice(0, 10))}
              </Td>
              <Td className="align-middle whitespace-nowrap">
                {a.justificatif_chemin ? (
                  <a
                    href={`/api/arrets-maladie/${a.id}/justificatif`}
                    className="text-sm text-blue-700 hover:underline"
                  >
                    Télécharger
                  </a>
                ) : (
                  <ReclamerJustificatifArret arretId={a.id} />
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

/** Arrêts maladie transmis par les salariés ou clients (cabinet). */
export default async function CabinetArretsMaladiePage() {
  await requireRole(["admin_cabinet", "collaborateur"]);
  const { getCabinetActif } = await import("@/lib/cabinet");
  const cabinet = await getCabinetActif();
  if (!cabinet) {
    const { redirect } = await import("next/navigation");
    redirect("/cabinet/cabinets");
  }
  const supabase = await createClient();

  const { data } = await supabase
    .from("arrets_maladie")
    .select("*, salaries(nom, prenom), dossiers!inner(sigle, cabinet_id)")
    .eq("dossiers.cabinet_id", cabinet!.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const liste = (data ?? []) as ArretLigne[];
  const auj = aujourdhuiParis();
  const enCours = liste.filter((a) => a.date_fin >= auj);
  const historique = liste.filter((a) => a.date_fin < auj);

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Arrêts maladie"
        sousTitre={`${enCours.length} arrêt(s) en cours`}
      />
      {enCours.length === 0 && historique.length === 0 ? (
        <EmptyState message="Aucun arrêt maladie déclaré." />
      ) : (
        <>
          {enCours.length > 0 && (
            <section>
              <h2 className="font-semibold mb-3">En cours</h2>
              <Tableau lignes={enCours} />
            </section>
          )}
          {historique.length > 0 && (
            <section>
              <h2 className="font-semibold mb-3">Historique</h2>
              <Tableau lignes={historique} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
