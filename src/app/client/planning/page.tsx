import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PlanningClient } from "@/components/planning-client";

export default async function ClientPlanningPage() {
  await requireRole(["client"]);

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Planning"
        sousTitre="Qui est présent ou absent selon les horaires, congés et arrêts maladie"
      />
      <PlanningClient />
    </div>
  );
}
