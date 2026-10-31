import { getProfile } from "@/lib/auth";
import { listerEspaces } from "@/lib/espaces";

/** Liens vers les autres espaces du même email (client, salarié, cabinet). */
export async function AutresEspaces() {
  const profile = await getProfile();
  if (!profile) return null;
  let liens: Awaited<ReturnType<typeof listerEspaces>> = [];
  try {
    liens = await listerEspaces(profile);
  } catch {
    return null;
  }
  const autres = liens.filter((l) => {
    if (profile.role === "client" && l.kind === "client" && l.dossierId === profile.dossier_id) {
      return false;
    }
    if (profile.role === "salarie" && l.kind === "salarie" && l.salarieId === profile.salarie_id) {
      return false;
    }
    if (
      !profile.espace_origine &&
      (profile.role === "directeur" ||
        profile.role === "admin_cabinet" ||
        profile.role === "collaborateur") &&
      l.kind === "cabinet"
    ) {
      return false;
    }
    return true;
  });
  if (autres.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">Autres espaces de ce compte</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {autres.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="underline">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
