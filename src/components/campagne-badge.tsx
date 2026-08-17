import { Badge } from "@/components/ui";
import type { Campagne } from "@/lib/types";

/** Statuts alignés sur l'app mobile (espace cabinet). */
export function CampagneStatutBadge({ campagne }: { campagne: Campagne }) {
  if (campagne.statut === "ouverte") {
    return <Badge variant="blue">Ouverte</Badge>;
  }
  if (campagne.statut === "cloturee_identique") {
    return <Badge variant="green">Identiques</Badge>;
  }
  if (campagne.statut === "bulletins_envoyes") {
    return <Badge variant="violet">Publié</Badge>;
  }
  return <Badge variant="green">Reçue</Badge>;
}
