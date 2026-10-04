import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, moisCourant, moisLabel } from "@/lib/format";
import {
  OuvrirCampagneIndividuelle,
  OuvrirCampagnes,
  RelancerCampagne,
  RouvrirCampagne,
} from "@/components/campagne-cabinet-actions";
import { CampagneStatutBadge } from "@/components/campagne-badge";
import {
  Badge,
  Card,
  CardBody,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import type { Campagne, Dossier } from "@/lib/types";

export default async function CabinetCampagnesPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string; dossier?: string }>;
}) {
  await requireRole(["admin_cabinet", "collaborateur"]);
  const sp = await searchParams;
  const mois = /^\d{4}-\d{2}-01$/.test(sp.mois ?? "") ? sp.mois! : moisCourant();
  const { getCabinetActif } = await import("@/lib/cabinet");
  const cabinet = await getCabinetActif();
  if (!cabinet) {
    const { redirect } = await import("next/navigation");
    redirect("/cabinet/cabinets");
  }
  const cabinetId = cabinet!.id;
  const supabase = await createClient();

  let dossierQuery = supabase
    .from("dossiers")
    .select("id, sigle, raison_sociale, archive, cabinet_id")
    .eq("archive", false)
    .eq("cabinet_id", cabinetId)
    .order("sigle");
  if (sp.dossier) dossierQuery = dossierQuery.eq("id", sp.dossier);
  const [{ data: dossiers }, { data: campagnes }] = await Promise.all([
    dossierQuery,
    supabase
      .from("campagnes")
      .select(
        "id, dossier_id, mois, statut, date_limite, envoyee_at, derniere_relance_at, paies_identiques, dossiers!inner(cabinet_id)"
      )
      .eq("mois", mois)
      .eq("dossiers.cabinet_id", cabinetId),
  ]);

  const listeDossiers = (dossiers ?? []) as Dossier[];
  const campagneParDossier = new Map(
    ((campagnes ?? []) as unknown as Campagne[]).map((c) => [c.dossier_id, c])
  );
  const sansCampagne = listeDossiers.filter((d) => !campagneParDossier.has(d.id));

  const moisPrecedent = new Date(mois + "T00:00:00");
  moisPrecedent.setMonth(moisPrecedent.getMonth() - 1);
  const moisSuivant = new Date(mois + "T00:00:00");
  moisSuivant.setMonth(moisSuivant.getMonth() + 1);
  const versMois = (d: Date) =>
    `/cabinet/campagnes?mois=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Campagnes de variables"
        actions={
          <div className="flex items-center gap-3 text-sm">
            <Link href={versMois(moisPrecedent)} className="text-blue-700 hover:underline">
              ← {moisLabel(
                `${moisPrecedent.getFullYear()}-${String(moisPrecedent.getMonth() + 1).padStart(2, "0")}-01`
              )}
            </Link>
            <span className="font-semibold">{moisLabel(mois)}</span>
            <Link href={versMois(moisSuivant)} className="text-blue-700 hover:underline">
              {moisLabel(
                `${moisSuivant.getFullYear()}-${String(moisSuivant.getMonth() + 1).padStart(2, "0")}-01`
              )}{" "}
              →
            </Link>
          </div>
        }
      />

      {sansCampagne.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="font-semibold mb-1">
              Ouvrir la campagne de {moisLabel(mois)}
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              {sansCampagne.length} dossier(s) actif(s) sans campagne sur ce
              mois. Ouverture automatique le 25 de chaque mois (date limite :
              le 15 du mois suivant). Vous pouvez aussi ouvrir manuellement
              avant, pour tous les dossiers ou dossier par dossier (bouton
              « Ouvrir »). Les clients seront notifiés par email.
            </p>
            <OuvrirCampagnes
              mois={mois}
              dossierIds={
                sp.dossier ? sansCampagne.map((d) => d.id) : undefined
              }
              libelle={
                sp.dossier && sansCampagne[0]
                  ? `Ouvrir pour ${sansCampagne[0].sigle}`
                  : "Ouvrir pour tous les dossiers sans campagne"
              }
            />
          </CardBody>
        </Card>
      )}

      <TableWrap>
        <thead className="bg-gray-50">
          <tr>
            <Th>Dossier</Th>
            <Th>Statut</Th>
            <Th>Date limite</Th>
            <Th>Reçue le</Th>
            <Th>Dernière relance</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {listeDossiers.map((d) => {
            const c = campagneParDossier.get(d.id);
            return (
              <tr key={d.id} className="hover:bg-gray-50">
                <Td className="font-semibold">
                  <Link
                    href={`/cabinet/dossiers/${d.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {d.sigle}
                  </Link>
                </Td>
                <Td>
                  {c ? (
                    <CampagneStatutBadge campagne={c} />
                  ) : (
                    <Badge variant="gray">Non ouverte</Badge>
                  )}
                </Td>
                <Td>{c ? formatDate(c.date_limite) : "-"}</Td>
                <Td>{c?.envoyee_at ? formatDateTime(c.envoyee_at) : "-"}</Td>
                <Td>
                  {c?.derniere_relance_at ? formatDateTime(c.derniere_relance_at) : "-"}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {!c && (
                      <OuvrirCampagneIndividuelle
                        mois={mois}
                        dossierId={d.id}
                        sigle={d.sigle}
                      />
                    )}
                    {c && (
                      <Link
                        href={`/cabinet/campagnes/${c.id}`}
                        className="text-blue-700 hover:underline"
                      >
                        Détail
                      </Link>
                    )}
                    {c?.statut === "ouverte" && (
                      <RelancerCampagne campagneId={c.id} />
                    )}
                    {c && c.statut !== "ouverte" && (
                      <RouvrirCampagne campagneId={c.id} libelle="Ouvrir de nouveau" />
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    </div>
  );
}
