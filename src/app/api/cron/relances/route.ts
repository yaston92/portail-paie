import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { destinatairesClientsParDossier, notifier } from "@/lib/notify";
import { formatDate, moisLabel } from "@/lib/format";

/**
 * Relances automatiques (cron quotidien).
 * Relance les campagnes ouvertes dont la date limite approche (J-2) ou est
 * dépassée, au plus une fois par 24 h.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();
  const dansDeuxJours = new Date();
  dansDeuxJours.setDate(dansDeuxJours.getDate() + 2);
  const seuil = dansDeuxJours.toISOString().slice(0, 10);
  const ilYA24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const aujourdHui = new Date().toISOString().slice(0, 10);

  const { data: campagnes } = await admin
    .from("campagnes")
    .select("id, dossier_id, mois, date_limite, derniere_relance_at")
    .eq("statut", "ouverte")
    .lte("date_limite", seuil);

  const aRelancer = (campagnes ?? []).filter(
    (c) => !c.derniere_relance_at || c.derniere_relance_at <= ilYA24h
  );
  if (aRelancer.length === 0) {
    return NextResponse.json({ ok: true, relancees: 0 });
  }

  const clientsParDossier = await destinatairesClientsParDossier(
    aRelancer.map((c) => c.dossier_id)
  );
  const maintenant = new Date().toISOString();

  const lot = 8;
  for (let i = 0; i < aRelancer.length; i += lot) {
    const slice = aRelancer.slice(i, i + lot);
    await Promise.all(
      slice.map(async (c) => {
        const enRetard = c.date_limite < aujourdHui;
        await notifier({
          userIds: clientsParDossier.get(c.dossier_id) ?? [],
          titre: enRetard
            ? `Retard : variables de paie ${moisLabel(c.mois)}`
            : `Rappel : variables de paie ${moisLabel(c.mois)}`,
          corps: enRetard
            ? `La date limite du ${formatDate(c.date_limite)} est dépassée. Merci de transmettre vos variables au plus vite.`
            : `Pensez à transmettre vos variables de paie avant le ${formatDate(c.date_limite)}.`,
          lien: `/client/variables/${c.id}`,
        });
        await admin
          .from("campagnes")
          .update({ derniere_relance_at: maintenant })
          .eq("id", c.id);
      })
    );
  }

  return NextResponse.json({ ok: true, relancees: aRelancer.length });
}
