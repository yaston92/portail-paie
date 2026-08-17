import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, roleHome } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const notifications = (data ?? []) as Notification[];

  // Marque tout comme lu à l'ouverture
  await supabase.from("notifications").update({ lu: true }).eq("lu", false);

  return (
    <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
      <PageHeader
        titre="Notifications"
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
                      {n.lien && (
                        <Link
                          href={n.lien}
                          className="text-sm text-blue-700 hover:underline"
                        >
                          Voir
                        </Link>
                      )}
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
