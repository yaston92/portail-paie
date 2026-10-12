import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_ESPACE } from "@/lib/espace";

/** Revient à l'espace cabinet. */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_ESPACE);
  return NextResponse.redirect(new URL("/cabinet", request.url));
}
