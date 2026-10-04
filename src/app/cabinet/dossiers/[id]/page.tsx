import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccesClientDossier } from "@/lib/acces-client";
import { estPresentSurMois, formatDate, moisCourant, moisLabel } from "@/lib/format";
import { OuvrirCampagnes } from "@/components/campagne-cabinet-actions";
import { DossierCreeToast } from "@/components/dossier-cree-toast";
import { DossierEditForm } from "@/components/dossier-edit-form";
import { InviterUtilisateur } from "@/components/inviter-utilisateur";
import { RenvoyerAccesClient } from "@/components/renvoyer-acces-client";
import { AjoutSalarieForm, ImportExcelForm } from "@/components/salarie-forms";
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
import type { Campagne, Dossier, Profile, Salarie } from "@/lib/types";

export default async function DossierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cree?: string }>;
}) {
  const profile = await requireRole(["admin_cabinet", "collaborateur"]);
  const { id } = await params;
  const { cree } = await searchParams;
  const supabase = await createClient();
  const mois = moisCourant();

  const [
    { data: dossier },
    { data: salaries },
    accesClient,
    { data: campagneMois },
  ] = await Promise.all([
    supabase.from("dossiers").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("salaries")
      .select("*")
      .eq("dossier_id", id)
      .order("nom"),
    getAccesClientDossier(id),
    supabase
      .from("campagnes")
      .select("id, statut")
      .eq("dossier_id", id)
      .eq("mois", mois)
      .maybeSingle(),
  ]);

  if (!dossier) notFound();
  const d = dossier as Dossier;

  const { data: membresRows } = await supabase
    .from("cabinet_membres")
    .select("profile:profiles (id, nom, prenom)")
    .eq("cabinet_id", d.cabinet_id);
  const collaborateurs: Pick<Profile, "id" | "nom" | "prenom">[] = [];
  for (const row of membresRows ?? []) {
    const p = (row as unknown as { profile?: Pick<Profile, "id" | "nom" | "prenom"> | null })
      .profile;
    if (p) collaborateurs.push(p);
  }

  const tous = (salaries ?? []) as Salarie[];
  const actifs = tous.filter((s) => estPresentSurMois(s, mois));
  const archives = tous.filter((s) => !estPresentSurMois(s, mois));
  const campagne = campagneMois as Pick<Campagne, "id" | "statut"> | null;

  return (
    <div className="space-y-6">
      <DossierCreeToast actif={cree === "1"} sigle={d.sigle} />
      <PageHeader
        titre={`${d.sigle} : ${d.raison_sociale}`}
        sousTitre={d.archive ? "Dossier archivé" : undefined}
        actions={
          <div className="flex gap-2">
            <Link
              href={`/cabinet/campagnes?dossier=${id}`}
              className="text-sm text-blue-700 hover:underline self-center"
            >
              Campagnes
            </Link>
            <Link
              href={`/cabinet/bulletins?dossier=${id}`}
              className="text-sm text-blue-700 hover:underline self-center"
            >
              Bulletins
            </Link>
          </div>
        }
      />

      {!d.archive && !campagne && (
        <Card>
          <CardBody>
            <h2 className="font-semibold mb-1">
              Campagne {moisLabel(mois)} : non ouverte
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              Ouvrir uniquement pour ce dossier. Le client sera notifié.
            </p>
            <OuvrirCampagnes
              mois={mois}
              dossierIds={[id]}
              libelle={`Ouvrir la campagne pour ${d.sigle}`}
            />
          </CardBody>
        </Card>
      )}
      {!d.archive && campagne && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              Campagne {moisLabel(mois)} en cours
            </p>
            <Link
              href={`/cabinet/campagnes/${campagne.id}`}
              className="text-sm text-blue-700 hover:underline"
            >
              Voir la campagne →
            </Link>
          </CardBody>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardBody>
            <h2 className="font-semibold mb-3">Informations du dossier</h2>
            {profile.role === "admin_cabinet" ||
            profile.role === "directeur" ? (
              <DossierEditForm
                dossier={d}
                collaborateurs={(collaborateurs ?? []) as Profile[]}
              />
            ) : (
              <dl className="text-sm space-y-2">
                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd>{d.email ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Téléphone</dt>
                  <dd>{d.telephone ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">SIRET</dt>
                  <dd>{d.siret ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Convention collective</dt>
                  <dd>{d.convention_collective ?? "-"}</dd>
                </div>
              </dl>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-semibold mb-3">Accès client employeur</h2>
            <div className="text-sm mb-4 space-y-3">
              {accesClient.statut === "actif" && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="green">Compte actif</Badge>
                    <span className="font-medium">{accesClient.email ?? "-"}</span>
                  </div>
                  <p className="text-gray-600 mt-1 text-xs">
                    {accesClient.doit_changer_mot_de_passe
                      ? "Le client s'est connecté avec le mot de passe provisoire et doit encore le changer."
                      : "Le client a un compte actif."}
                  </p>
                  {accesClient.email && (
                    <div className="mt-2">
                      <RenvoyerAccesClient dossierId={id} email={accesClient.email} />
                    </div>
                  )}
                </div>
              )}
              {accesClient.statut === "invitation_en_attente" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="amber">Invitation en attente</Badge>
                    <span className="font-medium">{accesClient.email ?? "-"}</span>
                  </div>
                  <p className="text-amber-900 mt-1 text-xs">
                    Mot de passe provisoire défini. Le client ne s&apos;est pas encore connecté.
                    Communiquez-lui le mot de passe : il le changera à la première connexion.
                  </p>
                  {accesClient.email && (
                    <div className="mt-2">
                      <RenvoyerAccesClient dossierId={id} email={accesClient.email} />
                    </div>
                  )}
                </div>
              )}
              {accesClient.statut === "aucun" && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <Badge variant="gray">Aucun accès</Badge>
                  <p className="text-gray-500 mt-1 text-xs">
                    Aucune invitation envoyée pour ce dossier.
                  </p>
                </div>
              )}
            </div>
            <details open={accesClient.statut === "aucun"}>
              <summary className="text-sm text-blue-700 cursor-pointer">
                {accesClient.statut === "aucun"
                  ? "Inviter un accès client"
                  : "Inviter un autre email"}
              </summary>
              <div className="mt-3">
                <InviterUtilisateur
                  role="client"
                  dossierId={id}
                  emailInitial=""
                  nomInitial={d.raison_sociale}
                  libelleBouton="Créer l'accès avec ce mot de passe"
                />
              </div>
            </details>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold">
              Salariés actifs ({actifs.length})
            </h2>
            <div className="flex gap-4">
              <details className="relative" open>
                <summary className="text-sm text-blue-700 cursor-pointer font-medium">
                  Ajouter un salarié
                </summary>
                <div className="mt-3 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <AjoutSalarieForm dossierId={id} />
                </div>
              </details>
              <details className="relative">
                <summary className="text-sm text-blue-700 cursor-pointer">
                  Import Excel
                </summary>
                <div className="mt-3 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <ImportExcelForm dossierId={id} />
                </div>
              </details>
            </div>
          </div>
          {actifs.length === 0 ? (
            <EmptyState message="Aucun salarié actif." />
          ) : (
            <TableWrap>
              <thead className="bg-gray-50">
                <tr>
                  <Th>Nom</Th>
                  <Th>Matricule</Th>
                  <Th>Contrat</Th>
                  <Th>Entrée</Th>
                  <Th>Sortie</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {actifs.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <Td>
                      <Link
                        href={`/cabinet/salaries/${s.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {s.nom} {s.prenom}
                      </Link>
                    </Td>
                    <Td>{s.matricule ?? "-"}</Td>
                    <Td>{s.type_contrat?.toUpperCase() ?? "-"}</Td>
                    <Td>{formatDate(s.date_entree)}</Td>
                    <Td>
                      {s.date_sortie ? (
                        <Badge variant="amber">
                          Sortie le {formatDate(s.date_sortie)}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      {archives.length > 0 && (
        <Card>
          <CardBody>
            <details>
              <summary className="font-semibold cursor-pointer">
                Archives : salariés sortis ({archives.length})
              </summary>
              <div className="mt-4">
                <TableWrap>
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Nom</Th>
                      <Th>Matricule</Th>
                      <Th>Sortie</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {archives.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <Td>
                          <Link
                            href={`/cabinet/salaries/${s.id}`}
                            className="text-blue-700 hover:underline"
                          >
                            {s.nom} {s.prenom}
                          </Link>
                        </Td>
                        <Td>{s.matricule ?? "-"}</Td>
                        <Td>{formatDate(s.date_sortie)}</Td>
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
