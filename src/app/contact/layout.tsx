import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Contact — ${LEGAL.application}`,
  description: `Signaler un problème concernant ${LEGAL.application} à ${LEGAL.editeur}.`,
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
