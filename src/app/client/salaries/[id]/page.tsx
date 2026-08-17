import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccesSalarie } from "@/lib/acces-salarie";
import { formatDate } from "@/lib/format";
import { InviterSalarieAcces } from "@/components/inviter-salarie-acces";
import { SortieSalarieForm } from "@/components/salarie-forms";
import { ArretMaladieClientForm } from "@/components/arret-maladie-form";
import { ArretsMaladieListe } from "@/components/arrets-maladie-liste";
import { HorairesSalarieForm } from "@/components/horaires-salarie-form";
import { labelMotifSortie } from "@/lib/sortie";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui";
import type { ArretMaladie, Salarie } from "@/lib/types";

export default async function ClientSalarieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole(["client"]);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data }, { data: arretsData }] = await Promise.all([
    supabase
      .from("salaries")
      .select("*")
      .eq("id", id)
      .eq("dossier_id", profile.dossier_id!)
      .maybeSingle(),
    supabase
      .from("arrets_maladie")
      .select("*")
      .eq("dossier_id", profile.dossier_id!)
      .eq("salarie_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!data) notFound();
  const s = data as Salarie;
  const arrets = (arretsData ?? []) as ArretMaladie[];
  const acces = await getAccesSalarie(s.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/client/salaries"
          className="text-sm text-blue-700 hover:underline"
        >
          ← Retour aux salariés
        </Link>
        <PageHeader
          titre={`${s.nom} ${s.prenom}`}
          sousTitre={[
            s.poste ?? null,
            s.type_contrat
              ? `${s.type_contrat.toUpperCase()}${
                  s.type_contrat === "cdd" && s.cdd_duree
                    ? ` (${s.cdd_duree})`
                    : ""
                }`
              : null,
            `Entrée ${formatDate(s.date_entree)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <div className="mt-2">
          {s.date_sortie ? (
            <Badge variant="amber">
              Sortie le {formatDate(s.date_sortie)}
              {s.motif_sortie
                ? ` : ${labelMotifSortie(s.motif_sortie)}`
                : ""}
            </Badge>
          ) : (
            <Badge variant="green">Actif</Badge>
          )}
        </div>
      </div>

      <Card>
        <CardBody className="space-y-6">
          <div>
            <p className="text-sm font-medium mb-2">Accès espace salarié</p>
            <InviterSalarieAcces
              salarieId={s.id}
              emailInitial={s.email}
              accesInitial={{
                statut: acces.statut,
                email: acces.email,
              }}
            />
          </div>

          <div className="border-t border-gray-100 pt-6">
            <p className="text-sm font-medium mb-2">Horaires de travail</p>
            <HorairesSalarieForm
              salarieId={s.id}
              dureeHebdo={s.duree_hebdo}
              horairesInitial={s.horaires}
              compact
            />
          </div>

          {s.statut === "actif" && !s.date_sortie && (
            <div className="border-t border-gray-100 pt-6">
              <details>
                <summary className="text-sm text-red-700 cursor-pointer font-medium">
                  Déclarer une sortie
                </summary>
                <div className="mt-3">
                  <SortieSalarieForm
                    salarieId={s.id}
                    variant="client"
                    compact
                  />
                </div>
              </details>
            </div>
          )}

          {s.statut === "actif" && (
            <div className="border-t border-gray-100 pt-6">
              <details>
                <summary className="text-sm text-amber-800 cursor-pointer font-medium">
                  Déclarer un arrêt maladie
                </summary>
                <div className="mt-3">
                  <ArretMaladieClientForm
                    salarieId={s.id}
                    salarieNom={`${s.prenom} ${s.nom}`}
                    compact
                  />
                </div>
              </details>
            </div>
          )}

          {arrets.length > 0 && (
            <div className="border-t border-gray-100 pt-6">
              <p className="text-sm font-medium mb-2">
                Arrêts maladie ({arrets.length})
              </p>
              <ArretsMaladieListe arrets={arrets} afficherSalarie={false} />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
