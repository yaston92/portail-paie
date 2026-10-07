import { Badge } from "@/components/ui";
import type { Campagne } from "@/lib/types";

/** La campagne est traitée dès que le cabinet l'a prise en compte ou a publié les bulletins. */
export function campagneTraitee(campagne: Pick<Campagne, "statut"> & { traitee_at?: string | null }) {
  return campagne.statut === "bulletins_envoyes" || !!campagne.traitee_at;
}

/** Statuts vus par le cabinet et le client. */
export function CampagneStatutBadge({ campagne }: { campagne: Campagne }) {
  if (campagne.statut === "ouverte") {
    return <Badge variant="blue">Ouverte</Badge>;
  }
  if (campagneTraitee(campagne)) {
    return <Badge variant="violet">Traité</Badge>;
  }
  return <Badge variant="amber">En cours</Badge>;
}
