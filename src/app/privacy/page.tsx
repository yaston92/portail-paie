import { redirect } from "next/navigation";

/** Alias anglais pour la Play Console / App Store. */
export default function PrivacyRedirect() {
  redirect("/confidentialite");
}
