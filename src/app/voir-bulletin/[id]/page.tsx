import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";

export default async function VoirBulletinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const { id } = await params;

  return (
    <main className="flex-1 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← Retour
        </Link>
        <a
          href={`/api/bulletins/${id}/telecharger`}
          className="rounded-lg bg-blue-800 px-3 py-2 text-sm font-medium text-white"
        >
          Enregistrer dans mes fichiers
        </a>
      </div>
      <iframe
        title="Bulletin de paie"
        src={`/api/bulletins/${id}/telecharger?inline=1`}
        className="h-[80vh] w-full rounded-lg border border-gray-200 bg-white"
      />
    </main>
  );
}
