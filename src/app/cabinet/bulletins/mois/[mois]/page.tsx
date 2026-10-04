import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCabinetActif } from "@/lib/cabinet";
import { createClient } from "@/lib/supabase/server";
import {
  formatDateTime,
  moisDepuisParam,
  moisLabel,
} from "@/lib/format";
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import type { BulletinUpload, Dossier } from "@/lib/types";

export default async function CabinetBulletinsMoisPage({
  params,
  searchParams,
}: {
  params: Promise<{ mois: string }>;
  searchParams: Promise<{ dossier?: string }>;
}) {
  await requireRole(["admin_cabinet", "collaborateur"]);
  const { mois: moisParam } = await params;
  const mois = moisDepuisParam(moisParam);
  if (!mois) notFound();

  const sp = await searchParams;
  const cabinet = await getCabinetActif();
  if (!cabinet) redirect("/cabinet/cabinets");

  const supabase = await createClient();

  const [{ data: dossiers }, { data: uploads }] = await Promise.all([
    supabase
      .from("dossiers")
      .select("id, sigle, raison_sociale")
      .eq("archive", false)
      .eq("cabinet_id", cabinet.id)
      .order("sigle"),
    supabase
      .from("bulletin_uploads")
      .select("*, dossiers!inner(cabinet_id)")
      .eq("mois", mois)
      .eq("dossiers.cabinet_id", cabinet.id)
      .order("created_at", { ascending: false }),
  ]);

  const listeDossiers = (dossiers ?? []) as Pick<
    Dossier,
    "id" | "sigle" | "raison_sociale"
  >[];
  const idsDossiers = new Set(listeDossiers.map((d) => d.id));
  const sigleParDossier = new Map(listeDossiers.map((d) => [d.id, d.sigle]));
  const listeUploads = ((uploads ?? []) as BulletinUpload[]).filter(
    (u) =>
      idsDossiers.has(u.dossier_id) &&
      (!sp.dossier || u.dossier_id === sp.dossier)
  );

  const retourHref = sp.dossier
    ? `/cabinet/bulletins?dossier=${sp.dossier}`
    : "/cabinet/bulletins";

  return (
    <div className="space-y-6">
      <PageHeader
        titre={moisLabel(mois)}
        sousTitre="Dépôts et publications de ce mois."
        actions={
          <Link
            href={retourHref}
            className="text-sm text-blue-700 hover:underline"
          >
            ← Tous les mois
          </Link>
        }
      />

      {listeUploads.length === 0 ? (
        <EmptyState message="Aucun dépôt pour ce mois." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              <Th>Dossier</Th>
              <Th>Pages</Th>
              <Th>Déposé le</Th>
              <Th>Statut</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listeUploads.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <Td className="font-semibold">
                  {sigleParDossier.get(u.dossier_id) ?? "-"}
                </Td>
                <Td>{u.nb_pages ?? "-"}</Td>
                <Td>{formatDateTime(u.created_at)}</Td>
                <Td>
                  {u.statut === "en_controle" ? (
                    <Badge variant="amber">En contrôle</Badge>
                  ) : (
                    <Badge variant="green">Publié</Badge>
                  )}
                </Td>
                <Td>
                  <span className="flex gap-3">
                    <Link
                      href={`/cabinet/bulletins/uploads/${u.id}`}
                      className="text-sm text-blue-700 hover:underline"
                    >
                      {u.statut === "en_controle" ? "Contrôler" : "Détail"}
                    </Link>
                    {u.statut === "publie" && (
                      <a
                        href={`/api/bulletins/zip?dossier=${u.dossier_id}&mois=${u.mois}`}
                        className="text-sm text-blue-700 hover:underline"
                      >
                        ZIP
                      </a>
                    )}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
