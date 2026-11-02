import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getProfile, isCabinetRole, roleHome } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { EtatNotification } from "@/components/etat-notification";
import { SupprimerNotification } from "@/components/supprimer-notification";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types";

/** Normalise les anciens libellés (tirets, « rouvert·e »). */
function texteNotif(texte: string): string {
  return texte
    .replace(/\s*[—–]\s*/g, " : ")
    .replace(/\s+:\s+/g, " : ")
    .replace(/saisie des variables rouverte/gi, "saisie des variables de nouveau ouverte")
    .replace(/campagne rouverte/gi, "saisie des variables de nouveau ouverte")
    .replace(/\ba rouvert\b/gi, "a de nouveau ouvert")
    .replace(/\brouverte\b/gi, "de nouveau ouverte")
    .replace(/\brouvert\b/gi, "de nouveau ouvert");
}

export default async function NotificationsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const limite =
    profile.role === "client"
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (limite) query = query.gte("created_at", limite);
  const { data } = await query;
  const notifications = (data ?? []) as Notification[];
  const aDesNonLues = notifications.some((n) => !n.lu);

  if (aDesNonLues || limite) {
    const userId = profile.id;
    const avant = limite;
    after(async () => {
      if (avant) {
        await createAdminClient()
          .from("notifications")
          .delete()
          .eq("user_id", userId)
          .lt("created_at", avant);
      }
      if (aDesNonLues) {
        await supabase
          .from("notifications")
          .update({ lu: true })
          .eq("user_id", userId)
          .eq("lu", false);
      }
    });
  }

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
      <PageHeader
        titre="Notifications"
        sousTitre={
          profile.role === "client"
            ? "Indiquez si chaque notification est traitée ou pas encore. Celles de plus de 30 jours sont retirées automatiquement."
            : "Indiquez si chaque notification est traitée ou pas encore."
        }
        actions={
          <Link
            href={roleHome(profile.role)}
            className="text-sm text-blue-700 hover:underline"
          >
            Retour à l&apos;accueil
          </Link>
        }
      />
      <Card>
        {notifications.length === 0 ? (
          <EmptyState message="Aucune notification." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {notifications.map((n) => (
              <li key={n.id}>
                <CardBody
                  className={`py-3 ${!n.lu ? "bg-blue-50/50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {texteNotif(n.titre)}
                      </p>
                      {n.corps && (
                        <p className="text-sm text-gray-600 mt-0.5">
                          {texteNotif(n.corps)}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <EtatNotification id={n.id} traite={n.traite === true} />
                        {n.lien && (
                          <Link
                            href={n.lien}
                            className="text-sm text-blue-700 hover:underline"
                          >
                            Voir
                          </Link>
                        )}
                        {isCabinetRole(profile.role) && (
                          <SupprimerNotification id={n.id} />
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDateTime(n.created_at)}
                    </span>
                  </div>
                </CardBody>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
