import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AttestationsDossier } from "@/components/attestations-dossier";
import { PageHeader } from "@/components/ui";
import type { AttestationDossier } from "@/lib/attestations";

export default async function ClientAttestationsPage() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("dossier_attestations")
    .select("id, dossier_id, type, nom_fichier, created_at")
    .eq("dossier_id", profile.dossier_id!)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        titre="Attestations"
        sousTitre="Vigilance, fiscale, Pro BTP et CIBTP déposées par le cabinet."
      />
      <AttestationsDossier
        dossierId={profile.dossier_id!}
        attestations={(data ?? []) as AttestationDossier[]}
        peutDeposer={false}
        afficherTitre={false}
      />
    </div>
  );
}
