import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getProfile, isCabinetRole, roleHome } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
  const admin = limite ? createAdminClient() : null;
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (limite) query = query.gte("created_at", limite);
  const [{ data }] = await Promise.all([
    query,
    admin
      ? admin
          .from("notifications")
          .delete()
          .eq("user_id", profile.id)
          .lt("created_at", limite!)
      : Promise.resolve(),
  ]);
  const notifications = (data ?? []) as Notification[];

  if (notifications.some((n) => !n.lu) || notifications.length === 100) {
    after(async () => {
      await supabase
        .from("notifications")
        .update({ lu: true })
        .eq("user_id", profile.id)
        .eq("lu", false);
    });
  }

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
      <PageHeader
        titre="Notifications"
        sousTitre={
          profile.role === "client"
            ? "Les notifications de plus de 30 jours sont retirées automatiquement."
            : isCabinetRole(profile.role)
              ? "Supprimez les notifications au fur et à mesure."
              : undefined
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
                      <div className="flex items-center gap-3 mt-1">
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
