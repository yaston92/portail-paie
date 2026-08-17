import { requireRole } from "@/lib/auth";
import { getCabinetActif } from "@/lib/cabinet";
import { createClient } from "@/lib/supabase/server";
import { CabinetsDirecteurClient } from "@/components/cabinets-directeur";
import type { Cabinet } from "@/lib/types";

export default async function CabinetsPage() {
  await requireRole(["directeur"]);
  const supabase = await createClient();
  const [{ data }, cabinetActif] = await Promise.all([
    supabase.from("cabinets").select("*").order("nom"),
    getCabinetActif(),
  ]);

  return (
    <CabinetsDirecteurClient
      initiaux={(data ?? []) as Cabinet[]}
      actifId={cabinetActif?.id ?? null}
    />
  );
}
