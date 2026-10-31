import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import {
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import type { Dossier, Profile } from "@/lib/types";

interface LigneAudit {
  id: number;
  user_id: string | null;
  action: string;
  cible_type: string | null;
  cible_id: string | null;
  dossier_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export default async function AuditPage() {
  await requireRole(["admin_cabinet"]);
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  const lignesBrutes = (logs ?? []) as LigneAudit[];
  const userIds = [
    ...new Set(lignesBrutes.map((l) => l.user_id).filter((id): id is string => !!id)),
  ];
  const dossierIds = [
    ...new Set(
      lignesBrutes.map((l) => l.dossier_id).filter((id): id is string => !!id)
    ),
  ];
  const [{ data: profils }, { data: dossiers }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, nom, prenom, email").in("id", userIds)
      : Promise.resolve({ data: [] as Profile[] }),
    dossierIds.length
      ? supabase.from("dossiers").select("id, sigle").in("id", dossierIds)
      : Promise.resolve({ data: [] as Pick<Dossier, "id" | "sigle">[] }),
  ]);

  const nomParId = new Map(
    ((profils ?? []) as Profile[]).map((p) => [
      p.id,
      `${p.prenom} ${p.nom}`.trim() || p.email,
    ])
  );
  const sigleParDossier = new Map(
    ((dossiers ?? []) as Pick<Dossier, "id" | "sigle">[]).map((d) => [d.id, d.sigle])
  );
  const lignes = lignesBrutes;

  return (
    <div className="space-y-4">
      <PageHeader
        titre="Journal d'audit"
        sousTitre="Consultations de données sensibles et actions clés (300 dernières entrées)."
      />
      {lignes.length === 0 ? (
        <EmptyState message="Aucune entrée d'audit." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              <Th>Date</Th>
              <Th>Utilisateur</Th>
              <Th>Action</Th>
              <Th>Dossier</Th>
              <Th>Détails</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lignes.map((l) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap text-gray-500">
                  {formatDateTime(l.created_at)}
                </Td>
                <Td>{l.user_id ? (nomParId.get(l.user_id) ?? "-") : "Système"}</Td>
                <Td className="font-mono text-xs">{l.action}</Td>
                <Td>
                  {l.dossier_id ? (sigleParDossier.get(l.dossier_id) ?? "-") : "-"}
                </Td>
                <Td className="text-xs text-gray-500 max-w-64 truncate">
                  {l.details ? JSON.stringify(l.details) : ""}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
