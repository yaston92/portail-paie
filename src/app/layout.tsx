import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastHost } from "@/components/toast-host";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ETIK Paie",
  description:
    "Portail d'échanges entre le cabinet ETIK Expertise, les clients employeurs et leurs salariés",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
