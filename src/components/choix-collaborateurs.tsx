"use client";

import { useState } from "react";

/** Cases à cocher : un, plusieurs, ou tous les collaborateurs du cabinet. */
export function ChoixCollaborateurs({
  collaborateurs,
  selection,
}: {
  collaborateurs: { id: string; prenom: string; nom: string }[];
  selection: string[];
}) {
  const [ids, setIds] = useState<string[]>(selection);

  function basculer(id: string) {
    setIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-700">
        Collaborateurs en charge
      </legend>
      <div className="flex gap-3 text-sm">
        <button
          type="button"
          className="text-blue-700 hover:underline"
          onClick={() => setIds(collaborateurs.map((c) => c.id))}
        >
          Tout sélectionner
        </button>
        <button
          type="button"
          className="text-blue-700 hover:underline"
          onClick={() => setIds([])}
        >
          Aucun
        </button>
      </div>
      <ul className="space-y-1">
        {collaborateurs.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="collaborateur_ids"
                value={c.id}
                checked={ids.includes(c.id)}
                onChange={() => basculer(c.id)}
              />
              {c.prenom} {c.nom}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
