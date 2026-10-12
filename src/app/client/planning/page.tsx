import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PlanningClient } from "@/components/planning-client";

export default async function ClientPlanningPage() {
  await requireRole(["client"]);

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Planning"
        sousTitre="Calendrier de lecture : qui est présent, en congé, en arrêt ou au repos. Rien ne se déclare ici, les informations viennent des horaires, des congés et des arrêts."
      />
      <PlanningClient />
    </div>
  );
}
