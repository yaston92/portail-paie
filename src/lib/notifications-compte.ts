import { compterNotificationsATraiter } from "@/lib/notifications-suivi";
import type { Profile } from "@/lib/types";

/** Nombre affiché sur la cloche : tâches encore en « pas encore ». */
export async function compterATraiter(profile: Profile): Promise<number> {
  return compterNotificationsATraiter(profile);
}
