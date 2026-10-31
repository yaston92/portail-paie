import Link from "next/link";

export function ActionsBulletin({ id }: { id: string }) {
  return (
    <span className="flex gap-3 whitespace-nowrap">
      <Link href={`/voir-bulletin/${id}`} className="text-blue-700 hover:underline">
        Voir
      </Link>
      <a
        href={`/api/bulletins/${id}/telecharger`}
        className="text-blue-700 hover:underline"
      >
        Enregistrer
      </a>
    </span>
  );
}
