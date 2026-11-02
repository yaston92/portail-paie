import { createAdminClient } from "@/lib/supabase/admin";

interface Abonnement {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Bannière du navigateur, pour les mêmes alertes que la cloche. */
export async function envoyerPushWeb(
  userIds: string[],
  titre: string,
  corps: string,
  lien?: string
) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || userIds.length === 0) return;

  const webpush = await import("web-push");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@fiakheir.fr",
    publicKey,
    privateKey
  );

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("web_push_abonnements")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error || !data?.length) {
    if (error) console.error("[push-web] lecture:", error.message);
    return;
  }

  const payload = JSON.stringify({ titre, corps, lien: lien ?? "/notifications" });
  const morts: string[] = [];
  await Promise.all(
    (data as Abonnement[]).map(async (abo) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: abo.endpoint,
            keys: { p256dh: abo.p256dh, auth: abo.auth },
          },
          payload
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) morts.push(abo.id);
        else console.error("[push-web]", status ?? e);
      }
    })
  );
  if (morts.length > 0) {
    await admin.from("web_push_abonnements").delete().in("id", morts);
  }
}
