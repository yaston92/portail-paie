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
import {
  lireVueNotification,
  listerNotifications,
  type VueNotification,
} from "@/lib/notifications-suivi";

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

function FiltreNotifications({ vue }: { vue: VueNotification }) {
  const choix = [
    { id: "pas-encore" as const, label: "Pas encore", href: "/notifications" },
    { id: "traite" as const, label: "Traité", href: "/notifications?vue=traite" },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-sm">
      {choix.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={`px-3 py-1.5 ${
            vue === item.id
              ? item.id === "traite"
                ? "bg-emerald-100 font-semibold text-emerald-900"
                : "bg-amber-100 font-semibold text-amber-900"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const vue = lireVueNotification((await searchParams).vue);
  const notifications = await listerNotifications(profile, vue);
  const supabase = await createClient();
  const limite =
    profile.role === "client"
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const userId = profile.id;

  after(async () => {
    if (limite) {
      await createAdminClient()
        .from("notifications")
        .delete()
        .eq("user_id", userId)
        .lt("created_at", limite);
    }
    await supabase
      .from("notifications")
      .update({ lu: true })
      .eq("user_id", userId)
      .eq("lu", false);
  });

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
      <PageHeader
        titre="Notifications"
        sousTitre={
          profile.role === "client"
            ? "Chaque notification commence en pas encore. Celles de plus de 30 jours sont retirées automatiquement."
            : isCabinetRole(profile.role)
              ? "Chaque notification commence en pas encore. Le statut est le même pour la direction et les collaborateurs."
              : "Chaque notification commence en pas encore."
        }
        actions={
          <>
            <FiltreNotifications vue={vue} />
            <Link
              href={roleHome(profile.role)}
              className="text-sm text-blue-700 hover:underline"
            >
              Retour à l&apos;accueil
            </Link>
          </>
        }
      />
      <Card>
        {notifications.length === 0 ? (
          <EmptyState
            message={
              vue === "traite"
                ? "Aucune notification traitée."
                : "Aucune notification en pas encore."
            }
          />
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
                      {n.collaborateurs.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {n.collaborateurs.length > 1 ? "Collaborateurs" : "Collaborateur"} :{" "}
                          {n.collaborateurs.join(", ")}
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
                        {isCabinetRole(profile.role) && n.user_id === profile.id && (
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
