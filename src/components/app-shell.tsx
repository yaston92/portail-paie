"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={items[0]?.href ?? "/"}
              className="flex items-center gap-2.5 font-bold text-lg min-w-0"
            >
              <Image
                src="/logo-etik.png"
                alt="ETIK Expertise"
                width={36}
                height={36}
                className="rounded-lg shrink-0 bg-white"
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
        <nav className="max-w-3xl mx-auto px-4 flex gap-1 overflow-x-auto scrollbar-none">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap px-3 py-2.5 text-sm rounded-t-xl transition-colors ${
                estActif(item.href)
                  ? "bg-gray-100 text-blue-800 font-semibold"
                  : "text-blue-100 hover:bg-blue-700"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-5">
        {children}
      </main>
    </div>
  );
}
