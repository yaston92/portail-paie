import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import {
  Alert,
  Badge,
  ButtonLink,
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import type { Embauche } from "@/lib/types";

function StatutBadge({ statut }: { statut: Embauche["statut"] }) {
  switch (statut) {
    case "envoye":
      return <Badge variant="blue">En attente de validation</Badge>;
    case "retourne":
      return <Badge variant="amber">À compléter</Badge>;
    case "valide":
      return <Badge variant="green">Validée</Badge>;
  }
}

export default async function ClientEmbauchesPage({
  searchParams,
}: {
  searchParams: Promise<{ envoye?: string }>;
}) {
  const profile = await requireRole(["client"]);
  const { envoye } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("embauches")
    .select("*")
    .eq("dossier_id", profile.dossier_id!)
    .order("created_at", { ascending: false });
  const embauches = (data ?? []) as Embauche[];

  return (
    <div className="space-y-4">
      <PageHeader
        titre="Déclarations d'embauche"
        actions={
          <ButtonLink href="/client/embauches/nouvelle">
            Déclarer une embauche
          </ButtonLink>
        }
      />
      {envoye && (
        <Alert variant="success">
          Votre déclaration d&apos;embauche a bien été envoyée au cabinet.
        </Alert>
      )}
      {embauches.length === 0 ? (
        <EmptyState message="Aucune déclaration d'embauche pour le moment." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              <Th>Salarié</Th>
              <Th>Poste</Th>
              <Th>Début</Th>
              <Th>Contrat</Th>
              <Th>Statut</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {embauches.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <Td>
                  <Link
                    href={`/client/embauches/${e.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {e.nom} {e.prenom}
                  </Link>
                </Td>
                <Td>{e.poste}</Td>
                <Td>{formatDate(e.date_debut)}</Td>
                <Td>{e.type_contrat.toUpperCase()}</Td>
                <Td>
                  <StatutBadge statut={e.statut} />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
