import path from "path";

const ECHELLE = 2;
const PAGES_MAX = 40;

/**
 * Certains logiciels de paie (export « QPtmp », pdf redessiné) tracent les
 * lettres en courbes. pdfjs n'y voit aucun caractère. On dessine la page,
 * puis on lit l'image sur le serveur, sans l'envoyer ailleurs.
 */
export async function lireTexteDessine(pdf: Buffer): Promise<string[] | null> {
  let canvas: typeof import("@napi-rs/canvas");
  try {
    canvas = await import("@napi-rs/canvas");
  } catch (e) {
    console.error("[pdf] rendu des pages impossible:", e);
    return null;
  }
  const g = globalThis as unknown as Record<string, unknown>;
  g.Path2D = canvas.Path2D;
  g.DOMMatrix = canvas.DOMMatrix;
  g.DOMPoint = canvas.DOMPoint;
  g.DOMRect = canvas.DOMRect;

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(pdf.byteLength);
  data.set(pdf);
  const chargement = pdfjs.getDocument({
    data,
    verbosity: 0,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  } as Parameters<typeof pdfjs.getDocument>[0]);

  const { createWorker, PSM } = await import("tesseract.js");
  const lecteur = await createWorker("fra", 1, {
    langPath: path.join(process.cwd(), "assets/tessdata"),
    gzip: true,
    cachePath: "/tmp/tessdata",
  });

  try {
    const doc = await chargement.promise;
    await lecteur.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    const total = doc.numPages;
    const limite = Math.min(total, PAGES_MAX);
    if (total > PAGES_MAX) {
      console.warn("[pdf] lecture des lettres dessinées limitée à", PAGES_MAX, "pages sur", total);
    }
    const textes = new Array<string>(total).fill("");
    for (let i = 1; i <= limite; i++) {
      const page = await doc.getPage(i);
      try {
        const viewport = page.getViewport({ scale: ECHELLE });
        const surface = canvas.createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height)
        );
        const ctx = surface.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, surface.width, surface.height);
        const rendu = page.render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
          canvas: surface as unknown as HTMLCanvasElement,
        });
        await rendu.promise;
        const { data: lu } = await lecteur.recognize(surface.toBuffer("image/png"));
        textes[i - 1] = lu.text ?? "";
      } catch (e) {
        console.error("[pdf] page dessinée illisible", i, e);
        textes[i - 1] = "";
      } finally {
        page.cleanup();
      }
    }
    return textes;
  } finally {
    await lecteur.terminate();
    await chargement.destroy().catch(() => undefined);
  }
}
