"use client";

import { useEffect, useState } from "react";
import { hideToast, subscribeToast } from "@/lib/toast";

/** Bannière flottante succès / erreur : disparaît seule. */
export function ToastHost() {
  const [state, setState] = useState({
    visible: false,
    kind: "success" as "success" | "error",
    message: "",
  });

  useEffect(() => {
    return subscribeToast(setState);
  }, []);

  if (!state.visible) return null;

  const isSuccess = state.kind === "success";

  return (
    <div
      className="fixed top-4 left-1/2 z-[9999] w-[min(100%-2rem,28rem)] -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={hideToast}
        className={
          isSuccess
            ? "w-full rounded-xl border border-green-300 bg-green-700 px-4 py-3.5 text-center text-base font-bold text-white shadow-lg"
            : "w-full rounded-xl border border-red-300 bg-red-700 px-4 py-3.5 text-center text-base font-bold text-white shadow-lg"
        }
      >
        {isSuccess ? `✓ ${state.message}` : state.message}
      </button>
    </div>
  );
}
