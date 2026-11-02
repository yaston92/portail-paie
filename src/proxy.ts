import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { HEADER_USER_ID } from "@/lib/session-header";

const CHEMINS_PUBLICS = [
  "/login",
  "/inscription",
  "/api/auth/inscription",
  "/auth",
  "/mot-de-passe-oublie",
  "/definir-mot-de-passe",
  "/confidentialite",
  "/privacy",
  "/contact",
  "/ouvrir",
];

function aUneSession(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => {
    if (!c.value) return false;
    return (
      c.name.startsWith("sb-") &&
      c.name.includes("-auth-token") &&
      !c.name.includes("code-verifier")
    );
  });
}

function copierCookies(depuis: NextResponse, vers: NextResponse) {
  for (const cookie of depuis.headers.getSetCookie()) {
    vers.headers.append("set-cookie", cookie);
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(HEADER_USER_ID);

  const suite = () =>
    NextResponse.next({ request: { headers: requestHeaders } });

  // Pages légales : accessibles sans compte, sans lecture de session.
  if (
    pathname.startsWith("/confidentialite") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/contact")
  ) {
    return suite();
  }

  // Les routes API s'authentifient elles-mêmes (cookies web OU Bearer mobile).
  // Ne jamais rediriger vers /login ici : l'app Expo n'a pas de cookies Next.
  if (pathname.startsWith("/api/")) {
    return suite();
  }

  const estPublic = CHEMINS_PUBLICS.some((p) => pathname.startsWith(p));

  // Pas de jeton : inutile d'appeler Supabase Auth (c'est l'aller-retour le plus lent).
  if (!aUneSession(request)) {
    if (!estPublic && pathname !== "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      if (pathname.startsWith("/") && !pathname.startsWith("//")) {
        url.searchParams.set("next", pathname);
      }
      return NextResponse.redirect(url);
    }
    return suite();
  }

  let cookieResponse = suite();

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
          cookieResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Rafraîchit la session si nécessaire (obligatoire avec @supabase/ssr)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) requestHeaders.set(HEADER_USER_ID, user.id);

  if (!user && !estPublic && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirection = NextResponse.redirect(url);
    copierCookies(cookieResponse, redirection);
    return redirection;
  }

  const out = suite();
  copierCookies(cookieResponse, out);
  return out;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
