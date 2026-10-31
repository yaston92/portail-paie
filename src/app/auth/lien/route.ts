import { NextResponse } from "next/server";
import { lireLien48h } from "@/lib/lien-duree";
import { createAdminClient } from "@/lib/supabase/admin";

function jeton(linkData: unknown): string | null {
  const props = (linkData as { properties?: { hashed_token?: string } } | null)?.properties;
  return props?.hashed_token || (linkData as { hashed_token?: string } | null)?.hashed_token || null;
}

function expire(origin: string) {
  return NextResponse.redirect(new URL("/auth/lien-expire", origin));
}

function redirigerApp(dest: string, hashed: string, type: string) {
  const base = dest.split("?")[0]!.replace(/\/$/, "");
  const app = new URL(base);
  app.searchParams.set("token_hash", hashed);
  app.searchParams.set("type", type);
  return new NextResponse(null, {
    status: 302,
    headers: { Location: app.toString() },
  });
}

/** Ouvre un lien email de moins de 48 h et redirige avec un jeton Supabase tout neuf. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lu = lireLien48h(url.searchParams.get("j"));
  if (!lu) return expire(url.origin);

  const admin = createAdminClient();
  try {
    if (lu.type === "signup") {
      const { data: profil } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", lu.email)
        .maybeSingle();
      if (profil?.id) {
        await admin.auth.admin.updateUserById(profil.id, { email_confirm: true });
        await admin.from("profiles").update({ email_confirme: true }).eq("id", profil.id);
      }
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: lu.email,
      });
      const hashed = jeton(data);
      if (error || !hashed) return expire(url.origin);
      const dest = new URL("/auth/confirmer-compte", url.origin);
      dest.searchParams.set("token_hash", hashed);
      dest.searchParams.set("type", "magiclink");
      return NextResponse.redirect(dest);
    }

    if (lu.type === "email_change" && lu.nouveau) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "email_change_new",
        email: lu.email,
        newEmail: lu.nouveau,
      });
      const hashed = jeton(data);
      if (error || !hashed) return expire(url.origin);
      if (lu.dest && /^(etikpaie|exp|exps):\/\//i.test(lu.dest)) {
        return redirigerApp(lu.dest, hashed, "email_change");
      }
      const dest = new URL("/auth/confirmer-email", url.origin);
      dest.searchParams.set("token_hash", hashed);
      dest.searchParams.set("type", "email_change");
      return NextResponse.redirect(dest);
    }

    const typeGen = lu.type === "magiclink" ? "magiclink" : "recovery";
    const { data, error } = await admin.auth.admin.generateLink({
      type: typeGen,
      email: lu.email,
    });
    const hashed = jeton(data);
    if (error || !hashed) return expire(url.origin);

    if (lu.dest && /^(etikpaie|exp|exps):\/\//i.test(lu.dest)) {
      return redirigerApp(lu.dest, hashed, typeGen);
    }

    const chemin = typeGen === "magiclink" ? "/auth/callback" : "/definir-mot-de-passe";
    const dest = new URL(chemin, url.origin);
    dest.searchParams.set("token_hash", hashed);
    dest.searchParams.set("type", typeGen);
    return NextResponse.redirect(dest);
  } catch {
    return expire(url.origin);
  }
}
