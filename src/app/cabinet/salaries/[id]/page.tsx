import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { labelMotifSortie } from "@/lib/sortie";
import { InviterUtilisateur } from "@/components/inviter-utilisateur";
import {
  NirReveal,
  SoldeCpForm,
  SortieSalarieForm,
  ModifierSalarieForm,
  SupprimerSalarieButton,
} from "@/components/salarie-forms";
import { ArretsMaladieListe } from "@/components/arrets-maladie-liste";
import { NavigationSalaries } from "@/components/navigation-salaries";
import { DocumentsSalarie } from "@/components/documents-salarie";
import {
  Badge,
  Card,
  CardBody,
  PageHeader,
} from "@/components/ui";
import type {
  ArretMaladie,
  Dossier,
  Salarie,
  SalarieDocument,
  SoldeCp,
} from "@/lib/types";

export default async function SalarieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin_cabinet", "collaborateur"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: salarie } = await supabase
    .from("salaries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!salarie) notFound();
  const s = salarie as Salarie;

  const [
    { data: dossier },
    { data: documents },
    { data: solde },
    { data: compte },
    { data: arretsData },
    { data: voisinsData },
  ] = await Promise.all([
    supabase.from("dossiers").select("*").eq("id", s.dossier_id).single(),
    supabase
      .from("salarie_documents")
      .select("*")
      .eq("salarie_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("soldes_cp").select("*").eq("salarie_id", id).maybeSingle(),
    s.profile_id
      ? supabase
          .from("profiles")
          .select("id, email")
          .eq("id", s.profile_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("arrets_maladie")
      .select("*")
      .eq("salarie_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("salaries")
      .select("id, nom, prenom")
      .eq("dossier_id", s.dossier_id)
      .order("nom"),
  ]);

  const d = dossier as Dossier;
  const docs = (documents ?? []) as SalarieDocument[];
  const cp = solde as SoldeCp | null;
  const arrets = (arretsData ?? []) as ArretMaladie[];
  const voisins = (voisinsData ?? []) as { id: string; nom: string; prenom: string }[];
  const indexVoisin = voisins.findIndex((v) => v.id === s.id);
  const precedent = indexVoisin > 0 ? voisins[indexVoisin - 1] : null;
  const suivant =
    indexVoisin >= 0 && indexVoisin < voisins.length - 1
      ? voisins[indexVoisin + 1]
      : null;

  return (
    <div className="space-y-6">
      <NavigationSalaries
        precedent={precedent}
        suivant={suivant}
        base="/cabinet/salaries"
      />
      <PageHeader
        titre={`${s.nom} ${s.prenom}`}
        sousTitre={`Dossier ${d.sigle} : ${d.raison_sociale}`}
        actions={
          <Link
            href={`/cabinet/dossiers/${s.dossier_id}`}
            className="text-sm text-blue-700 hover:underline"
          >
            Retour au dossier
          </Link>
        }
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardBody>
            <h2 className="font-semibold mb-3">Modifier la fiche</h2>
            <p className="text-sm text-gray-500 mb-3">
              Statut :{" "}
              {s.statut === "actif" ? (
                <Badge variant="green">Actif</Badge>
              ) : (
                <Badge variant="gray">
                  Sorti le {formatDate(s.date_sortie)}
                  {s.motif_sortie
                    ? ` : ${labelMotifSortie(s.motif_sortie)}`
                    : ""}
                </Badge>
              )}
              <span className="ml-2">
                NIR actuel : <NirReveal salarieId={id} />
              </span>
            </p>
            <ModifierSalarieForm salarie={s} />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-semibold mb-3">Accès salarié</h2>
            {compte ? (
              <p className="text-sm">
                <Badge variant="green">Compte actif</Badge>{" "}
                <span className="ml-1">{compte.email}</span>
              </p>
            ) : (
              <details>
                <summary className="text-sm text-blue-700 cursor-pointer">
                  Inviter le salarié sur son espace
                </summary>
                <div className="mt-3">
                  <InviterUtilisateur
                    role="salarie"
                    dossierId={s.dossier_id}
                    salarieId={id}
                    emailInitial={s.email ?? ""}
                    nomInitial={s.nom}
                    prenomInitial={s.prenom}
                  />
                </div>
              </details>
            )}

            <h2 className="font-semibold mb-3 mt-6">Solde de congés payés</h2>
            {cp && (
              <p className="text-xs text-gray-500 mb-2">
                Source : {cp.source === "extraction" ? "bulletin" : "saisie manuelle"} :
                mis à jour le {formatDate(cp.updated_at.slice(0, 10))}
              </p>
            )}
            <SoldeCpForm
              salarieId={id}
              dossierId={s.dossier_id}
              acquis={cp?.acquis ?? null}
              pris={cp?.pris ?? null}
              restant={cp?.restant ?? null}
              acquisN1={cp?.acquis_n1 ?? null}
              acquisN={cp?.acquis_n ?? null}
              prisN1={cp?.pris_n1 ?? null}
              prisN={cp?.pris_n ?? null}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3">
            Arrêts maladie ({arrets.length})
          </h2>
          <ArretsMaladieListe arrets={arrets} afficherSalarie={false} />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <DocumentsSalarie salarieId={id} documents={docs} peutDeposer />
        </CardBody>
      </Card>

      {s.statut === "actif" && (
        <Card>
          <CardBody>
            <details>
              <summary className="font-semibold cursor-pointer text-red-700">
                Sortie du salarié (fin de contrat)
              </summary>
              <div className="mt-4 max-w-md">
                <SortieSalarieForm salarieId={id} />
              </div>
            </details>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3 text-red-800">Zone dangereuse</h2>
          <SupprimerSalarieButton
            salarieId={id}
            dossierId={s.dossier_id}
            nomComplet={`${s.nom} ${s.prenom}`}
          />
        </CardBody>
      </Card>
    </div>
  );
}
