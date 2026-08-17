import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { obtenirSoldeCp } from "@/lib/solde-cp-sync";
import { soldePrevisionnel } from "@/lib/demandes-conge";
import { formatDate, moisLabel } from "@/lib/format";
import { Alert, Card, CardBody, PageHeader } from "@/components/ui";
import { SoldeCpTableau } from "@/components/solde-cp-tableau";
import { DemandeCongeForm } from "@/components/demande-conge-form";
import { ArretMaladieSalarieForm } from "@/components/arret-maladie-form";
import type { ArretMaladie, Bulletin, DemandeConge, Salarie, SoldeCp } from "@/lib/types";

export default async function SalarieAccueilPage() {
  const profile = await requireRole(["salarie"]);
  const supabase = await createClient();

  const [{ data: salarie }, { data: dernierBulletin }, { data: demandesRaw }, { data: arretsRaw }, cp] =
    await Promise.all([
      supabase
        .from("salaries")
        .select("id, poste, opposition_bulletin")
        .eq("id", profile.salarie_id!)
        .maybeSingle(),
      supabase
        .from("bulletins")
        .select("id, mois, published_at")
        .eq("salarie_id", profile.salarie_id!)
        .order("mois", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("demandes_conge")
        .select("*")
        .eq("salarie_id", profile.salarie_id!)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("arrets_maladie")
        .select("*")
        .eq("salarie_id", profile.salarie_id!)
        .order("created_at", { ascending: false })
        .limit(50),
      obtenirSoldeCp(profile.salarie_id!),
    ]);

  const s = salarie as Salarie | null;
  const bulletin = dernierBulletin as Bulletin | null;
  const demandes = (demandesRaw ?? []) as DemandeConge[];
  const arrets = (arretsRaw ?? []) as ArretMaladie[];
  const solde = cp as SoldeCp | null;
  const previsionnel = solde
    ? soldePrevisionnel(solde.restant, demandes, solde.mois_reference)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        titre={`Bonjour ${profile.prenom || profile.nom}`}
        sousTitre={s?.poste ?? undefined}
      />

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-4">Vos congés payés</h2>
          {solde ? (
            <SoldeCpTableau cp={solde} previsionnel={previsionnel} />
          ) : (
            <p className="text-sm text-gray-500">
              Votre solde de congés sera affiché après la publication de votre
              prochain bulletin.
            </p>
          )}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <DemandeCongeForm demandesInitiales={demandes} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-4">Arrêts maladie</h2>
          <ArretMaladieSalarieForm arretsInitiales={arrets} />
        </CardBody>
      </Card>

      {bulletin && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-sm">Dernier bulletin</p>
              <p className="text-sm text-gray-600">
                {moisLabel(bulletin.mois)} : publié le{" "}
                {formatDate(bulletin.published_at.slice(0, 10))}
              </p>
            </div>
            <div className="flex gap-4 text-sm">
              <a
                href={`/api/bulletins/${bulletin.id}/telecharger`}
                className="text-blue-700 hover:underline"
              >
                Télécharger
              </a>
              <Link
                href="/salarie/bulletins"
                className="text-blue-700 hover:underline"
              >
                Tous mes bulletins →
              </Link>
            </div>
          </CardBody>
        </Card>
      )}

      {s?.opposition_bulletin && (
        <Alert variant="warning">
          Vous avez exercé votre droit d&apos;opposition au bulletin
          dématérialisé : vos bulletins vous sont remis sous forme papier par
          votre employeur. Vous pouvez lever cette opposition dans les{" "}
          <Link href="/salarie/parametres" className="underline">
            paramètres
          </Link>
          .
        </Alert>
      )}
    </div>
  );
}
