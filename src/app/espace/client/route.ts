import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_ESPACE } from "@/lib/espace";

/** Ouvre l'espace client rattaché au compte cabinet (même email). */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_ESPACE, "client", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.redirect(new URL("/client", request.url));
}
