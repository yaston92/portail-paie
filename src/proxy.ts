import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const CHEMINS_PUBLICS = [
  "/login",
  "/inscription",
  "/api/auth/inscription",
  "/auth",
  "/mot-de-passe-oublie",
  "/definir-mot-de-passe",
  "/confidentialite",
  "/privacy",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pages légales : accessibles sans compte, sans lecture de session.
  if (
    pathname.startsWith("/confidentialite") ||
    pathname.startsWith("/privacy")
  ) {
    return NextResponse.next({ request });
  }

  // Les routes API s'authentifient elles-mêmes (cookies web OU Bearer mobile).
  // Ne jamais rediriger vers /login ici : l'app Expo n'a pas de cookies Next.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Rafraîchit la session si nécessaire (obligatoire avec @supabase/ssr)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const estPublic = CHEMINS_PUBLICS.some((p) => pathname.startsWith(p));

  if (!user && !estPublic && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
