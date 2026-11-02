import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import {
  compterNotificationsATraiter,
  lireVueNotification,
  listerNotifications,
} from "@/lib/notifications-suivi";

/** Liste des notifications, filtrée, avec le suivi partagé du cabinet. */
export async function GET(request: Request) {
  const profile = await getApiProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const vue = lireVueNotification(new URL(request.url).searchParams.get("vue") ?? undefined);
  if (new URL(request.url).searchParams.get("compte") === "1") {
    const n = await compterNotificationsATraiter(profile);
    return NextResponse.json({ n });
  }
  const notifications = await listerNotifications(profile, vue);
  return NextResponse.json(notifications);
}
