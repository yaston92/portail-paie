import { requireRole } from "@/lib/auth";
import { getCabinetActif } from "@/lib/cabinet";
import { createClient } from "@/lib/supabase/server";
import { RetentionForm } from "@/components/retention-form";
import { PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";

/** Conservation RGPD (écran détail, comme l’app). */
export default async function ParametresPage() {
  await requireRole(["admin_cabinet", "directeur"]);
  const cabinet = await getCabinetActif();
  if (!cabinet) redirect("/cabinet/cabinets");
  const supabase = await createClient();

  const { data: reglages } = await supabase
    .from("retention_settings")
    .select("*")
    .order("type_document");

  return (
    <div>
      <PageHeader
        titre="Conservation RGPD"
        sousTitre="Durées de conservation des documents (mois)"
        actions={
          <a
            href="/cabinet/compte"
            className="text-sm text-blue-700 hover:underline"
          >
            ← Compte
          </a>
        }
      />
      <RetentionForm reglages={reglages ?? []} />
    </div>
  );
}
