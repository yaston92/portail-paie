import type { NextConfig } from "next";

function hoteSupabase(): string | null {
  const brut = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!brut) return null;
  try {
    return new URL(brut).host;
  } catch {
    return null;
  }
}

const supabaseHost = hoteSupabase();
const connectSrc = ["'self'", supabaseHost ? `https://${supabaseHost}` : "", supabaseHost ? `wss://${supabaseHost}` : ""]
  .filter(Boolean)
  .join(" ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "frame-src 'self' blob:",
      "object-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Autorise le tunnel Cloudflare en dev (liens mails depuis le téléphone)
  allowedDevOrigins: [
    "packing-competitors-hygiene-ski.trycloudflare.com",
    "*.trycloudflare.com",
  ],
  // pdfjs, le canvas natif et tesseract restent hors du bundle (binaire, wasm).
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "tesseract.js", "tesseract.js-core"],
  // Le canvas linux et le français de tesseract servent aux PDF dont les lettres sont dessinées.
  outputFileTracingIncludes: {
    "/api/bulletins/**/*": [
      "./node_modules/@napi-rs/canvas/geometry.js",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./assets/tessdata/**/*",
    ],
    "/api/salarie/solde": [
      "./node_modules/@napi-rs/canvas/geometry.js",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./assets/tessdata/**/*",
    ],
  },
  // Uploads embauche (PDF / photos) : défaut proxy = 10 Mo → corps tronqué → FormData cassé
  experimental: {
    proxyClientMaxBodySize: "50mb",
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
