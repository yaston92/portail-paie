import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import {
  Badge,
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import type { Embauche } from "@/lib/types";

function Tableau({
  lignes,
  sigleParDossier,
}: {
  lignes: Embauche[];
  sigleParDossier: Map<string, string>;
}) {
  return (
    <TableWrap>
      <thead className="bg-gray-50">
        <tr>
          <Th>Dossier</Th>
          <Th>Salarié</Th>
          <Th>Poste</Th>
          <Th>Début</Th>
          <Th>Reçue le</Th>
          <Th>Statut</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {lignes.map((e) => (
          <tr key={e.id} className="hover:bg-gray-50">
            <Td className="font-semibold">
              {sigleParDossier.get(e.dossier_id) ?? "-"}
            </Td>
            <Td>
              <Link
                href={`/cabinet/embauches/${e.id}`}
                className="font-medium text-blue-700 hover:underline"
              >
                {e.nom} {e.prenom}
              </Link>
            </Td>
            <Td>
              {e.poste || "-"}
              {e.accompagnement && (
                <Badge variant="amber">Rappel souhaité</Badge>
              )}
            </Td>
            <Td>{formatDate(e.date_debut)}</Td>
            <Td>{formatDate(e.created_at.slice(0, 10))}</Td>
            <Td>
              {e.statut === "envoye" && <Badge variant="blue">À valider</Badge>}
              {e.statut === "retourne" && (
                <Badge variant="amber">Retournée au client</Badge>
              )}
              {e.statut === "valide" && <Badge variant="green">Validée</Badge>}
            </Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export default async function CabinetEmbauchesPage() {
  const profile = await requireRole(["directeur", "admin_cabinet", "collaborateur"]);
  const { getCabinetActif } = await import("@/lib/cabinet");
  const cabinet = await getCabinetActif();
  if (!cabinet) {
    const { redirect } = await import("next/navigation");
    redirect("/cabinet/cabinets");
  }
  const supabase = await createClient();

  const { data: embauches } = await supabase
    .from("embauches")
    .select("*, dossiers!inner(sigle)")
    .eq("dossiers.cabinet_id", cabinet!.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const sigleParDossier = new Map<string, string>();
  const liste = ((embauches ?? []) as (Embauche & {
    dossiers: { sigle: string } | { sigle: string }[] | null;
  })[]).map((row) => {
    const joint = Array.isArray(row.dossiers) ? row.dossiers[0] : row.dossiers;
    if (joint?.sigle) sigleParDossier.set(row.dossier_id, joint.sigle);
    const { dossiers: _dossier, ...embauche } = row;
    return embauche;
  });
  const enAttente = liste.filter((e) => e.statut === "envoye");
  const autres = liste.filter((e) => e.statut !== "envoye");

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Embauches"
        sousTitre={
          profile.role === "directeur"
            ? `${enAttente.length} à traiter pour tout le cabinet`
            : `${enAttente.length} déclaration(s) en attente de validation`
        }
      />
      {enAttente.length === 0 && autres.length === 0 ? (
        <EmptyState message="Aucune déclaration d'embauche." />
      ) : (
        <>
          {enAttente.length > 0 && (
            <section>
              <h2 className="font-semibold mb-3">À valider</h2>
              <Tableau lignes={enAttente} sigleParDossier={sigleParDossier} />
            </section>
          )}
          {autres.length > 0 && (
            <section>
              <h2 className="font-semibold mb-3">Historique</h2>
              <Tableau lignes={autres} sigleParDossier={sigleParDossier} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
