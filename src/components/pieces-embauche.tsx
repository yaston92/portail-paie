"use client";

import { useState } from "react";

const IMAGES = new Set(["png", "jpg", "jpeg", "gif", "webp", "heic"]);

export interface PieceAAfficher {
  type: string;
  chemin: string | null;
  label: string;
}

/** Les pièces restent masquées : un clic les ouvre dans la visionneuse à droite. */
export function PiecesEmbauche({
  id,
  pieces,
}: {
  id: string;
  pieces: PieceAAfficher[];
}) {
  const [actif, setActif] = useState<string | null>(null);
  const piece = pieces.find((p) => p.type === actif && p.chemin) ?? null;
  const ext = piece?.chemin?.includes(".")
    ? piece.chemin.split(".").pop()!.toLowerCase()
    : "";
  const url = piece ? `/api/embauches/${id}/piece/${piece.type}` : "";
  const image = IMAGES.has(ext);

  return (
    <div className="grid md:grid-cols-2 gap-4 items-start">
      <ul className="space-y-2">
        {pieces.map((p) => {
          const selectionne = actif === p.type;
          return (
            <li key={p.type}>
              {p.chemin ? (
                <button
                  type="button"
                  onClick={() => setActif(p.type)}
                  className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${
                    selectionne
                      ? "border-blue-600 bg-blue-50 font-medium"
                      : "border-gray-200 bg-white hover:border-blue-300"
                  }`}
                >
                  {p.label}
                  <span className="block text-xs text-blue-700 mt-0.5">
                    Afficher
                  </span>
                </button>
              ) : (
                <p className="text-sm text-gray-500 px-1">{p.label} : non déposée</p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="min-h-48 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
        {!piece && (
          <p className="text-sm text-gray-500">
            Cliquez sur une pièce pour l&apos;afficher ici.
          </p>
        )}
        {piece && image && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{piece.label}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={piece.label}
              className="max-h-[70vh] w-full rounded-lg border border-gray-200 bg-white object-contain"
            />
            <a href={`${url}?telecharger=1`} className="text-xs text-blue-700 hover:underline">
              Télécharger
            </a>
          </div>
        )}
        {piece && !image && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{piece.label}</p>
            <a href={url} className="text-sm text-blue-700 hover:underline">
              Ouvrir le document
            </a>
            <a
              href={`${url}?telecharger=1`}
              className="block text-xs text-blue-700 hover:underline"
            >
              Télécharger
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
