import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { estPresentSurMois, formatDate, moisCourant, moisLabel } from "@/lib/format";
import { CampagneStatutBadge } from "@/components/campagne-badge";
import { ButtonLink, Card, CardBody, PageHeader } from "@/components/ui";
import type { Campagne, Dossier, Salarie } from "@/lib/types";

export default async function ClientAccueilPage() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();

  const [{ data: dossier }, { data: campagnes }, { data: salaries }, { count: embauchesEnCours }] =
    await Promise.all([
      supabase
        .from("dossiers")
        .select("id, raison_sociale, sigle")
        .eq("id", profile.dossier_id!)
        .single(),
      supabase
        .from("campagnes")
        .select("id, mois, statut, date_limite, paies_identiques")
        .eq("dossier_id", profile.dossier_id!)
        .order("mois", { ascending: false })
        .limit(3),
      supabase
        .from("salaries")
        .select("id, date_entree, date_sortie")
        .eq("dossier_id", profile.dossier_id!),
      supabase
        .from("embauches")
        .select("id", { count: "exact", head: true })
        .eq("dossier_id", profile.dossier_id!)
        .in("statut", ["envoye", "retourne"]),
    ]);

  const d = dossier as Pick<Dossier, "id" | "raison_sociale" | "sigle">;
  const actifs = ((salaries ?? []) as Pick<
    Salarie,
    "id" | "date_entree" | "date_sortie"
  >[]).filter((s) => estPresentSurMois(s as Salarie, moisCourant()));
  const campagneEnCours = ((campagnes ?? []) as Campagne[]).find(
    (c) => c.statut === "ouverte"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titre={`Bonjour, ${d.raison_sociale}`}
        sousTitre="Votre espace d'échanges avec le cabinet"
      />

      {campagneEnCours && (
        <Card className="border-blue-300 bg-blue-50/50">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                Variables de paie : {moisLabel(campagneEnCours.mois)}
              </p>
              <p className="text-sm text-gray-600">
                À transmettre avant le {formatDate(campagneEnCours.date_limite)}.
              </p>
            </div>
            <ButtonLink href={`/client/variables/${campagneEnCours.id}`}>
              Compléter maintenant
            </ButtonLink>
          </CardBody>
        </Card>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardBody>
            <p className="text-3xl font-bold text-blue-800">{actifs.length}</p>
            <p className="text-sm text-gray-500">Salariés actifs</p>
            <Link
              href="/client/salaries"
              className="text-sm text-blue-700 hover:underline"
            >
              Voir la liste →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-3xl font-bold text-blue-800">
              {embauchesEnCours ?? 0}
            </p>
            <p className="text-sm text-gray-500">Embauches en cours</p>
            <Link
              href="/client/embauches"
              className="text-sm text-blue-700 hover:underline"
            >
              Déclarer une embauche →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-3xl font-bold text-blue-800">
              {(campagnes ?? []).length > 0 ? (
                <CampagneStatutBadge campagne={(campagnes ?? [])[0] as Campagne} />
              ) : (
                "-"
              )}
            </p>
            <p className="text-sm text-gray-500">Dernière campagne</p>
            <Link
              href="/client/variables"
              className="text-sm text-blue-700 hover:underline"
            >
              Variables de paie →
            </Link>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-2">Bulletins de paie</h2>
          <p className="text-sm text-gray-500 mb-2">
            Retrouvez les bulletins publiés par le cabinet, à l&apos;unité ou en
            archive ZIP mensuelle.
          </p>
          <Link
            href="/client/bulletins"
            className="text-sm text-blue-700 hover:underline"
          >
            Accéder aux bulletins →
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
