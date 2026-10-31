import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_ESPACE } from "@/lib/espace";

/** Ouvre l'espace client rattaché au compte cabinet (même email). */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const dossier = new URL(request.url).searchParams.get("dossier");
  const valeur = dossier && /^[0-9a-f-]{36}$/i.test(dossier) ? `client:${dossier}` : "client";
  cookieStore.set(COOKIE_ESPACE, valeur, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.redirect(new URL("/client", request.url));
}
