import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiCabinetProfile } from "@/lib/auth";
import { COOKIE_CABINET_ID, getCabinetsMembre } from "@/lib/cabinet";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  cabinet_id: z.string().uuid(),
});

/** Définit le cabinet actif (cookie) pour la session web / API. */
export async function POST(request: Request) {
  const profile = await getApiCabinetProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "cabinet_id invalide" }, { status: 400 });
  }

  const membres = await getCabinetsMembre(profile.id);
  if (!membres.some((m) => m.id === body.data.cabinet_id)) {
    return NextResponse.json({ error: "Cabinet inaccessible" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true, cabinet_id: body.data.cabinet_id });
  res.cookies.set(COOKIE_CABINET_ID, body.data.cabinet_id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

/** Liste des cabinets du membre + cabinet actif (cookie/header). */
export async function GET() {
  const profile = await getApiCabinetProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const supabase = await createClient();
  const { data: membres } = await supabase
    .from("cabinet_membres")
    .select("role_membre, cabinet:cabinets (id, nom, archive, created_at)")
    .eq("profile_id", profile.id);

  const cabinets = (membres ?? [])
    .map((row) => {
      const c = (row as unknown as { cabinet?: { id: string; nom: string; archive: boolean; created_at: string } | null }).cabinet;
      if (!c || c.archive) return null;
      return {
        ...c,
        role_membre: (row as unknown as { role_membre: string }).role_membre,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ cabinets });
}
