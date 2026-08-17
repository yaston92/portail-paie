"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface NavItem {
  href: string;
  label: string;
}

interface AppShellProps {
  titre: string;
  nomUtilisateur: string;
  roleLabel: string;
  items: NavItem[];
  notificationsNonLues: number;
  headerExtra?: ReactNode;
  /** Lien du nom utilisateur (défaut : /compte). */
  compteHref?: string;
  children: ReactNode;
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={
          direction === "left"
            ? "M15.75 19.5L8.25 12l7.5-7.5"
            : "M8.25 4.5l7.5 7.5-7.5 7.5"
        }
      />
    </svg>
  );
}

function NavOnglets({
  items,
  estActif,
}: {
  items: NavItem[];
  estActif: (href: string) => boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [peutGauche, setPeutGauche] = useState(false);
  const [peutDroite, setPeutDroite] = useState(false);
  const pathname = usePathname();

  const actualiser = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setPeutGauche(el.scrollLeft > 2);
    setPeutDroite(max > 2 && el.scrollLeft < max - 2);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    actualiser();
    el.addEventListener("scroll", actualiser, { passive: true });
    const ro = new ResizeObserver(actualiser);
    ro.observe(el);
    window.addEventListener("resize", actualiser);
    return () => {
      el.removeEventListener("scroll", actualiser);
      ro.disconnect();
      window.removeEventListener("resize", actualiser);
    };
  }, [actualiser, items]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const actif = el.querySelector<HTMLElement>('[data-nav-actif="true"]');
    actif?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: "smooth",
    });
    actualiser();
  }, [pathname, actualiser]);

  function scrollPar(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: "smooth" });
  }

  const afficherFleches = peutGauche || peutDroite;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 flex items-stretch gap-0.5">
      {afficherFleches && (
        <button
          type="button"
          onClick={() => scrollPar(-1)}
          disabled={!peutGauche}
          aria-label="Onglets précédents"
          className="shrink-0 self-center p-1.5 rounded-lg text-blue-100 hover:bg-blue-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-default"
        >
          <Chevron direction="left" />
        </button>
      )}
      <div
        ref={scrollerRef}
        role="navigation"
        aria-label="Navigation principale"
        className="flex-1 min-w-0 flex gap-1 overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {items.map((item) => {
          const actif = estActif(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-nav-actif={actif ? "true" : undefined}
              className={`whitespace-nowrap px-3 py-2.5 text-sm rounded-t-xl transition-colors shrink-0 ${
                actif
                  ? "bg-gray-100 text-blue-800 font-semibold"
                  : "text-blue-100 hover:bg-blue-700"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      {afficherFleches && (
        <button
          type="button"
          onClick={() => scrollPar(1)}
          disabled={!peutDroite}
          aria-label="Onglets suivants"
          className="shrink-0 self-center p-1.5 rounded-lg text-blue-100 hover:bg-blue-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-default"
        >
          <Chevron direction="right" />
        </button>
      )}
    </div>
  );
}

export function AppShell({
  titre,
  nomUtilisateur,
  roleLabel,
  items,
  notificationsNonLues,
  headerExtra,
  compteHref = "/compte",
  children,
}: AppShellProps) {
  const pathname = usePathname();

  function estActif(href: string) {
    const base = items[0]?.href ?? "/";
    if (href === base) return pathname === base;
    return pathname.startsWith(href);
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-gray-100">
      <header className="bg-blue-800 text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={items[0]?.href ?? "/"}
              className="flex items-center gap-2.5 font-bold text-lg min-w-0"
            >
              <Image
                src="/logo-etik-paie.png"
                alt="ETIK Paie"
                width={110}
                height={36}
                className="h-9 w-auto shrink-0 bg-white rounded-md object-contain"
                priority
              />
              <span className="truncate">{titre}</span>
            </Link>
            <span className="hidden sm:inline text-xs bg-blue-700/80 rounded-md px-2 py-0.5 shrink-0">
              {roleLabel}
            </span>
            {headerExtra}
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/notifications"
              className="relative p-1.5 hover:bg-blue-700 rounded-lg"
              aria-label="Notifications"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                />
              </svg>
              {notificationsNonLues > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-400 text-blue-950 text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                  {notificationsNonLues > 9 ? "9+" : notificationsNonLues}
                </span>
              )}
            </Link>
            <Link
              href={compteHref}
              className="text-sm text-blue-100 hover:text-white hover:underline max-w-[10rem] truncate"
              title="Mon compte"
            >
              <span className="sm:hidden">Compte</span>
              <span className="hidden sm:inline">{nomUtilisateur}</span>
            </Link>
            <form action="/auth/deconnexion" method="post">
              <button
                type="submit"
                className="text-sm text-blue-100 hover:text-white hover:underline"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
        <NavOnglets items={items} estActif={estActif} />
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5">
        {children}
      </main>
    </div>
  );
}
