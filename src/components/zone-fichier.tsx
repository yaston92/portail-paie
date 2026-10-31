"use client";

import { useRef, useState } from "react";

/** Champ fichier : clic ou glisser-déposer. */
export function ZoneFichier({
  name,
  accept,
  required,
  multiple,
}: {
  name: string;
  accept?: string;
  required?: boolean;
  multiple?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [noms, setNoms] = useState<string[]>([]);
  const [survol, setSurvol] = useState(false);

  function poser(files: File[]) {
    if (!ref.current || files.length === 0) return;
    const dt = new DataTransfer();
    for (const file of multiple ? files : files.slice(0, 1)) dt.items.add(file);
    ref.current.files = dt.files;
    setNoms(Array.from(dt.files).map((f) => f.name));
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurvol(false);
        poser(Array.from(e.dataTransfer.files));
      }}
      className={`rounded-lg border border-dashed px-3 py-4 text-center text-sm ${
        survol ? "border-blue-600 bg-blue-50" : "border-gray-300 bg-gray-50"
      }`}
    >
      <input
        ref={ref}
        type="file"
        name={name}
        accept={accept}
        required={required && noms.length === 0}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => setNoms(Array.from(e.target.files ?? []).map((f) => f.name))}
      />
      <p className="text-gray-600">Glissez le fichier ici</p>
      <button
        type="button"
        className="mt-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        onClick={() => ref.current?.click()}
      >
        Choisir un fichier
      </button>
      {noms.length > 0 && <p className="mt-2 text-xs text-gray-700">{noms.join(", ")}</p>}
    </div>
  );
}
