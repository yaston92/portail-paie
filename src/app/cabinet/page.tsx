import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCabinetActif } from "@/lib/cabinet";
import { createClient } from "@/lib/supabase/server";
import { calculerDashboard } from "@/lib/dashboard";
import { formatDate, moisCourant, moisLabel } from "@/lib/format";
import {
  Badge,
  Card,
  CardBody,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";

function pct(a: number, b: number): string {
  return b > 0 ? `${Math.round((a / b) * 100)}%` : "-";
}

function NiveauxCard({
  titre,
  demandes,
  recus,
  envoyes,
}: {
  titre: string;
  demandes: number;
  recus: number;
  envoyes: number;
}) {
  return (
    <Card>
      <CardBody>
        <h2 className="font-semibold mb-4">{titre}</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-3xl font-bold text-gray-800">{demandes}</p>
            <p className="text-xs text-gray-500 mt-1">Demandées</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-blue-700">
              {recus}
              <span className="text-base font-medium text-gray-400 ml-1">
                ({pct(recus, demandes)})
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-1">Reçues</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-green-700">
              {envoyes}
              <span className="text-base font-medium text-gray-400 ml-1">
                ({pct(envoyes, demandes)})
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-1">Envoyées</p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default async function CabinetDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string; collaborateur?: string }>;
}) {
  await requireRole(["admin_cabinet", "collaborateur"]);
  const sp = await searchParams;
  const mois = /^\d{4}-\d{2}-01$/.test(sp.mois ?? "") ? sp.mois! : moisCourant();
  const collaborateurId = sp.collaborateur || undefined;

  const cabinet = await getCabinetActif();
  if (!cabinet) redirect("/cabinet/cabinets");

  const supabase = await createClient();
  const { lignes, totaux, collaborateurs: collabs } = await calculerDashboard(
    supabase,
    mois,
    collaborateurId,
    cabinet.id
  );

  const enRetard = lignes.filter((l) => l.enRetard);

  const moisPrecedent = new Date(mois + "T00:00:00");
  moisPrecedent.setMonth(moisPrecedent.getMonth() - 1);
  const moisSuivant = new Date(mois + "T00:00:00");
  moisSuivant.setMonth(moisSuivant.getMonth() + 1);
  const cleMois = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const lienMois = (m: string) =>
    `/cabinet?mois=${m}${collaborateurId ? `&collaborateur=${collaborateurId}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Tableau de bord"
        actions={
          <div className="flex items-center gap-3 text-sm">
            <Link
              href={lienMois(cleMois(moisPrecedent))}
              className="text-blue-700 hover:underline"
            >
              ←
            </Link>
            <span className="font-semibold">{moisLabel(mois)}</span>
            <Link
              href={lienMois(cleMois(moisSuivant))}
              className="text-blue-700 hover:underline"
            >
              →
            </Link>
          </div>
        }
      />

      {/* Filtre par collaborateur */}
      <div className="flex flex-wrap items-center gap-3">
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="mois" value={mois} />
          <select
            name="collaborateur"
            defaultValue={collaborateurId ?? ""}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Tous les collaborateurs</option>
            {collabs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.prenom} {c.nom}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="text-sm text-blue-700 hover:underline"
          >
            Filtrer
          </button>
        </form>
      </div>

      {/* Les 2 axes de mesure */}
      <div className="grid lg:grid-cols-2 gap-4">
        <NiveauxCard
          titre={`Dossiers (${totaux.dossiers.total} actifs)`}
          demandes={totaux.dossiers.demandes}
          recus={totaux.dossiers.recus}
          envoyes={totaux.dossiers.envoyes}
        />
        <NiveauxCard
          titre="Paies"
          demandes={totaux.paies.demandees}
          recus={totaux.paies.recues}
          envoyes={totaux.paies.envoyees}
        />
      </div>

      {/* Dossiers en retard */}
      {enRetard.length > 0 && (
        <Card className="border-red-200">
          <CardBody>
            <h2 className="font-semibold mb-3 text-red-700">
              Dossiers en retard ({enRetard.length})
            </h2>
            <ul className="divide-y divide-gray-100 text-sm">
              {enRetard.map((l) => (
                <li key={l.dossier.id} className="py-2 flex items-center justify-between">
                  <Link
                    href={`/cabinet/campagnes/${l.campagne!.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {l.dossier.sigle} : {l.dossier.raison_sociale}
                  </Link>
                  <span className="text-gray-500">
                    limite : {formatDate(l.campagne!.date_limite)} :{" "}
                    {l.paiesAttendues} paie(s)
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Détail par dossier */}
      <TableWrap>
        <thead className="bg-gray-50">
          <tr>
            <Th>Dossier</Th>
            <Th>Collaborateur</Th>
            <Th>Variables</Th>
            <Th>Paies attendues</Th>
            <Th>Bulletins envoyés</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lignes.map((l) => (
            <tr key={l.dossier.id} className="hover:bg-gray-50">
              <Td className="font-semibold">
                {l.campagne ? (
                  <Link
                    href={`/cabinet/campagnes/${l.campagne.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {l.dossier.sigle}
                  </Link>
                ) : (
                  <Link
                    href={`/cabinet/dossiers/${l.dossier.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {l.dossier.sigle}
                  </Link>
                )}
              </Td>
              <Td>{l.collaborateurNom}</Td>
              <Td>
                {!l.demande ? (
                  <Badge variant="gray">Non demandées</Badge>
                ) : l.recu ? (
                  <Badge variant="green">Reçues</Badge>
                ) : l.enRetard ? (
                  <Badge variant="red">En retard</Badge>
                ) : (
                  <Badge variant="blue">En attente</Badge>
                )}
              </Td>
              <Td>{l.paiesAttendues}</Td>
              <Td>
                {l.envoye ? (
                  <span className="text-green-700 font-medium">
                    {l.paiesEnvoyees}
                  </span>
                ) : (
                  "-"
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
