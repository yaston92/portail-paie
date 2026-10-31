import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_ESPACE } from "@/lib/espace";

/** Ouvre l'espace salarié rattaché à ce compte (éventuellement une autre société). */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_ESPACE, `salarie:${id}`, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.redirect(new URL("/salarie", request.url));
}
