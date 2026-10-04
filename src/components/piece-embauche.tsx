const IMAGES = new Set(["png", "jpg", "jpeg", "gif", "webp", "heic"]);

/** Aperçu sur la page pour les photos, lien de téléchargement pour les PDF. */
export function PieceEmbauche({
  id,
  type,
  chemin,
  label,
}: {
  id: string;
  type: string;
  chemin: string | null;
  label: string;
}) {
  if (!chemin) {
    return <p className="text-sm text-gray-500">{label} : non déposée</p>;
  }
  const ext = chemin.includes(".") ? chemin.split(".").pop()!.toLowerCase() : "";
  const url = `/api/embauches/${id}/piece/${type}`;
  const image = IMAGES.has(ext);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-800">{label}</p>
      {image ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="max-h-80 w-full rounded-lg border border-gray-200 bg-white object-contain"
          />
        </a>
      ) : (
        <a href={url} className="text-sm text-blue-700 hover:underline">
          Ouvrir le document
        </a>
      )}
      <a
        href={`${url}?telecharger=1`}
        className="block text-xs text-blue-700 hover:underline"
      >
        Télécharger
      </a>
    </div>
  );
}
